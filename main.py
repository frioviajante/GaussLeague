import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sympy import sympify, simplify
from passlib.context import CryptContext
import jwt
import psycopg
from psycopg.rows import dict_row

load_dotenv(".env.local")
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
JWT_SECRET = os.environ.get("JWT_SECRET", "irodov-arena-dev-secret-key")
JWT_ALGORITHM = "HS256"

app = FastAPI(title="Gauss League Judge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL não configurada no servidor.")
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SubmissionRequest(BaseModel):
    problem_id: str
    answer: str

def create_token(user_id: str) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Faça login para continuar.")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")

def check_answer(user_input: str, expected_answer: str, answer_type: str, tolerance: float = 0.02) -> bool:
    try:
        if answer_type == "numeric":
            u_val = float(sympify(user_input).evalf())
            e_val = float(sympify(expected_answer).evalf())
            if e_val == 0:
                return abs(u_val) <= tolerance
            return abs(u_val - e_val) / abs(e_val) <= tolerance
        elif answer_type == "algebraic":
            u_expr = sympify(user_input)
            e_expr = sympify(expected_answer)
            return simplify(u_expr - e_expr) == 0
    except Exception:
        return False
    return False

@app.get("/")
def health_check():
    return {"status": "online", "service": "Gauss League SymPy Judge"}

@app.post("/auth/signup")
def signup(req: SignupRequest, conn=Depends(get_db)):
    hashed = pwd_context.hash(req.password)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (username, email, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, username, email, rating, max_rating, solved_count
                """,
                (req.username.strip(), req.email.strip().lower(), hashed),
            )
            user = cur.fetchone()
            conn.commit()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=400, detail="E-mail ou username já cadastrado.")

    return {"token": create_token(user["id"]), "user": user}

@app.post("/auth/login")
def login(req: LoginRequest, conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM users WHERE email = %s", (req.email.strip().lower(),))
        user = cur.fetchone()

    if not user or not pwd_context.verify(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    user.pop("password_hash", None)
    return {"token": create_token(user["id"]), "user": user}

@app.get("/auth/me")
def get_me(user_id: str = Depends(get_current_user_id), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, username, email, rating, max_rating, solved_count FROM users WHERE id = %s",
            (user_id,),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return user

@app.get("/problems")
def list_problems(source: str = "irodov", conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, irodov_code, title, category, difficulty_rating,
                   statement_latex, svg_diagram, figure_url, answer_type, unit, variables_hint, source
            FROM problems
            WHERE source = %s
            ORDER BY
                COALESCE(NULLIF(regexp_replace(split_part(irodov_code, '.', 1), '[^0-9]', '', 'g'), ''), '0')::int ASC,
                COALESCE(NULLIF(regexp_replace(split_part(irodov_code, '.', 2), '[^0-9]', '', 'g'), ''), '0')::int ASC,
                irodov_code ASC
            """,
            (source,),
        )
        return cur.fetchall()

@app.get("/problems/{problem_id}/editorial")
def get_editorial(problem_id: str, user_id: str = Depends(get_current_user_id), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM submissions WHERE user_id = %s AND problem_id = %s AND verdict = 'AC'",
            (user_id, problem_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Resolva o problema primeiro para desbloquear o editorial.")

        cur.execute("SELECT editorial_latex FROM problems WHERE id = %s", (problem_id,))
        row = cur.fetchone()
        return {"editorial_latex": row["editorial_latex"] if row else ""}

@app.get("/leaderboard")
def leaderboard(conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, username, rating, max_rating, solved_count
            FROM users
            ORDER BY rating DESC
            LIMIT 50
            """
        )
        return cur.fetchall()

@app.get("/submissions/me")
def my_submissions(user_id: str = Depends(get_current_user_id), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, problem_id, submitted_answer, verdict, created_at
            FROM submissions
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 30
            """,
            (user_id,),
        )
        return cur.fetchall()

@app.post("/submit")
def submit_solution(req: SubmissionRequest, user_id: str = Depends(get_current_user_id), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM problems WHERE id = %s", (req.problem_id,))
        problem = cur.fetchone()
        if not problem:
            raise HTTPException(status_code=404, detail="Problema não encontrado.")

        is_correct = check_answer(
            req.answer,
            problem["expected_answer"],
            problem["answer_type"],
            problem.get("tolerance") or 0.02,
        )
        verdict = "AC" if is_correct else "WA"

        cur.execute(
            "SELECT apply_physelo_update(%s::uuid, %s::uuid, %s) AS new_rating",
            (user_id, req.problem_id, is_correct),
        )
        new_rating = cur.fetchone()["new_rating"]

        cur.execute(
            """
            INSERT INTO submissions (user_id, problem_id, submitted_answer, verdict)
            VALUES (%s, %s, %s, %s)
            RETURNING id, problem_id, submitted_answer, verdict, created_at
            """,
            (user_id, req.problem_id, req.answer, verdict),
        )
        sub = cur.fetchone()
        conn.commit()

    return {"verdict": verdict, "new_rating": new_rating, "submission": sub}

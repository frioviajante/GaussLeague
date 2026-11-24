import os
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import jwt
from passlib.context import CryptContext
import pint
import psycopg
from psycopg.rows import dict_row
from pydantic import BaseModel
from sympy import (
    Symbol,
    acos,
    asin,
    atan,
    cos,
    exp,
    log,
    pi,
    posify,
    simplify,
    sin,
    sqrt,
    tan,
)
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

load_dotenv(".env.local")
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
JWT_SECRET = os.environ.get("JWT_SECRET", "irodov-arena-dev-secret-key")
JWT_ALGORITHM = "HS256"

ureg = pint.UnitRegistry()
Q_ = ureg.Quantity

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

PHYSICS_LOCALS = {
    **{
        name: Symbol(name)
        for name in (
            "S", "N", "Q", "O", "C", "E", "I",
            "gamma", "beta", "zeta",
            "Lambda", "Ei", "Si", "Ci", "Li", "lam",
        )
    },
    "sen": sin,
    "tg": tan,
    "arcsen": asin,
    "arcsin": asin,
    "arccos": acos,
    "arctan": atan,
    "arctg": atan,
    "ln": log,
    "pi": pi,
    "sqrt": sqrt,
    "exp": exp,
}

app = FastAPI(title="NOIC League Judge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def normalized_category_sql(col: str = "category") -> str:
    """Agrupa subtags em áreas principais usando regex POSIX com fronteira de palavra."""
    c = f"COALESCE(TRIM({col}), '')"
    return rf"""
        CASE
            WHEN {c} ~* '\m(qu[âa]nt|relativ|nucle|at[ôo]m|part[íi]cul|modern|f[óo]ton|photon|semicondut|estado s[óo]lido|solid state|raios[- ]?x|x[- ]?ray)'
                THEN 'Física Moderna'
            WHEN {c} ~* '\m(termo|thermo|calor|heat|t[ée]rmic|entrop|g[áa]s|gases|estat[íi]st|statist|teoria cin[ée]t|kinetic theory|dilata[çc])'
                THEN 'Termodinâmica'
            WHEN {c} ~* '\m(eletr|electr|magnet|circuit|indu[çc]|capacit|maxwell|corrente|resist[êe]nc|diel[ée]tr|amp[èe]re|faraday)'
                THEN 'Eletromagnetismo'
            WHEN {c} ~* '\m([óo]pt|lente|lens|espelho|mirror|difra|interfer|refra|reflex|luz\M|light|polariz|laser|fenda)'
                THEN 'Óptica'
            WHEN {c} ~* '\m(ond|wave|oscil|ac[úu]st|acoust|som\M|sound|mhs\M|shm\M|harm[ôo]n|resson|reson|p[êe]ndul|vibr|doppler)'
                THEN 'Ondulatória'
            WHEN {c} ~* '\m(mec[âa]n|mech|cinem|kinem|din[âa]m|dynam|est[áa]t|stat|gravit|fluid|hidro|hydro|colis|rota[çc]|r[íi]gid|rigid|energ|trabalh|moment|el[áa]st|for[çc]a|newton|lagrang|hamilton|atrit|cin[ée]t|bal[íi]st|aerodin|lan[çc]ament|impuls|in[ée]rc)'
                THEN 'Mecânica'
            ELSE 'Física Geral'
        END
    """


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
    answer: str = ""
    self_verdict: Optional[Literal["AC", "WA"]] = None


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


def _clean_expr(raw: str) -> str:
    s = raw.strip()
    if "=" in s:
        s = s.split("=")[-1].strip()
    s = re.sub(r"(?<=\d),(?=\d)", ".", s)
    s = re.sub(r"(?<![a-zA-Z_])lambda(?![a-zA-Z0-9_])", "lam", s)
    return s.replace("×", "*").replace("\\cdot", "*").replace("⋅", "*")


def _normalize_unit_str(unit: str) -> str:
    u = unit.strip().strip("[]()")
    if not u:
        return ""
    u = (
        u.replace("²", "**2")
        .replace("³", "**3")
        .replace("⁻¹", "**-1")
        .replace("⁻²", "**-2")
        .replace("⁻³", "**-3")
        .replace("^", "**")
        .replace("Ω", "ohm")
        .replace("µ", "u")
        .replace("μ", "u")
        .replace("°C", "degC")
        .replace("ºC", "degC")
        .replace("°F", "degF")
        .replace("ºF", "degF")
        .replace("°", "deg")
        .replace("º", "deg")
        .replace("%", "percent")
        .replace("×", "*")
        .replace("·", "*")
        .replace("⋅", "*")
    )
    u = re.sub(r"\boC\b", "degC", u)
    u = re.sub(r"\bAtm\b", "atm", u)
    u = re.sub(r"\bohms?\b", "ohm", u, flags=re.IGNORECASE)
    u = re.sub(r"\bseg(?:undos?)?\b", "s", u, flags=re.IGNORECASE)
    u = re.sub(r"\bhoras?\b", "h", u, flags=re.IGNORECASE)
    u = re.sub(r"\bgraus?\b", "deg", u, flags=re.IGNORECASE)
    u = re.sub(r"(?<=[a-zA-Z])\.(?=[a-zA-Z])", "*", u)  # N.m -> N*m, J.s -> J*s
    u = re.sub(r"([a-zA-Z]+)(\d+)\b", r"\1**\2", u)     # m/s2 -> m/s**2, cm3 -> cm**3

    if ("/" in u or "*" in u) and "degC" in u:
        u = u.replace("degC", "K")
    return u.strip()


def _try_eval_pure_number(expr_str: str) -> Optional[float]:
    try:
        expr = parse_expr(expr_str, local_dict=PHYSICS_LOCALS, transformations=TRANSFORMATIONS)
        if expr.free_symbols:
            return None
        val = complex(expr.evalf())
        if abs(val.imag) > 1e-9:
            return None
        return float(val.real)
    except Exception:
        return None


def _try_parse_unit(unit_str: str) -> Optional[str]:
    norm = _normalize_unit_str(unit_str)
    if not norm:
        return None
    try:
        Q_(1.0, norm)
        return norm
    except Exception:
        return None


def _parse_quantity(raw: str) -> tuple[Optional[float], Optional[str]]:
    """Extrai (valor_float, unidade_normalizada_ou_None) aceitando expressões + unidades."""
    s = _clean_expr(raw)
    if not s:
        return None, None

    # 1. Expressão puramente numérica sem unidade (ex: "0.1", "1/10", "sqrt(2)/2", "2*pi")
    pure_val = _try_eval_pure_number(s)
    if pure_val is not None:
        return pure_val, None

    # 2. Número/expressão separado da unidade por espaço (ex: "1/10 m/s", "sqrt(2) km/h", "10 m / s")
    for m in re.finditer(r"\s+", s):
        left = s[: m.start()].strip()
        right = s[m.end() :].strip()
        if not left or not right:
            continue
        val = _try_eval_pure_number(left)
        if val is not None:
            unit_norm = _try_parse_unit(right)
            if unit_norm is not None:
                return val, unit_norm

    # 3. Número colado na unidade sem espaço (ex: "10cm/s", "500g", "20°C", "1.5e-3km/h")
    m_tight = re.match(r"^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.+)$", s)
    if m_tight:
        val = float(m_tight.group(1))
        unit_norm = _try_parse_unit(m_tight.group(2))
        if unit_norm is not None:
            return val, unit_norm

    return None, None


def _close_enough(u_val: float, e_val: float, tolerance: float) -> bool:
    if e_val == 0:
        return abs(u_val) <= tolerance
    return abs(u_val - e_val) / abs(e_val) <= tolerance


def _numeric_algebraic_equiv(u_expr, e_expr, n_tests: int = 6) -> bool:
    """Fallback numérico em pontos reais positivos para identidades que o simplify não reduz."""
    syms = sorted(u_expr.free_symbols | e_expr.free_symbols, key=lambda s: s.name)
    rng = random.Random(1337)
    valid = 0

    for low, high in ((0.15, 0.85), (1.15, 3.85)):
        for _ in range(n_tests):
            subs = {s: rng.uniform(low, high) for s in syms}
            try:
                uv = complex(u_expr.evalf(subs=subs))
                ev = complex(e_expr.evalf(subs=subs))
            except Exception:
                continue
            if abs(uv.imag) > 1e-6 or abs(ev.imag) > 1e-6:
                continue
            ur, er = uv.real, ev.real
            if not (abs(ur) < 1e12 and abs(er) < 1e12):
                continue
            if abs(ur - er) > 1e-5 * max(1.0, abs(er)):
                return False
            valid += 1
            if valid >= n_tests:
                return True

    return False


def check_answer(
    user_input: str,
    expected_answer: str,
    answer_type: str,
    tolerance: float = 0.02,
    expected_unit: str = "",
) -> bool:
    try:
        if answer_type == "numeric":
            e_val, e_inline_unit = _parse_quantity(expected_answer)
            if e_val is None:
                return False

            eff_e_unit = e_inline_unit or _try_parse_unit(expected_unit)

            # Fallback para unidades não-físicas (ex: "blocos", "R$")
            raw_user = user_input
            if expected_unit and eff_e_unit is None:
                cleaned_custom = expected_unit.strip()
                if raw_user.strip().lower().endswith(cleaned_custom.lower()):
                    raw_user = raw_user.strip()[: -len(cleaned_custom)].strip()

            u_val, u_unit = _parse_quantity(raw_user)
            if u_val is None:
                return False

            # Caso A: usuário digitou unidade e a questão tem unidade física cadastrada
            if u_unit is not None and eff_e_unit is not None:
                u_q = Q_(u_val, u_unit)
                e_q = Q_(e_val, eff_e_unit)
                if not u_q.is_compatible_with(e_q):
                    return False
                u_converted = float(u_q.to(e_q.units).magnitude)
                return _close_enough(u_converted, e_val, tolerance)

            # Caso B: usuário digitou apenas o número (assume a unidade padrão do enunciado)
            if u_unit is None:
                return _close_enough(u_val, e_val, tolerance)

            # Caso C: questão sem unidade cadastrada, mas usuário digitou unidade adimensional (%, rad, deg)
            u_q = Q_(u_val, u_unit)
            if u_q.dimensionless:
                return _close_enough(float(u_q.to_base_units().magnitude), e_val, tolerance)

            return False

        elif answer_type == "algebraic":
            u_expr = parse_expr(_clean_expr(user_input), local_dict=PHYSICS_LOCALS, transformations=TRANSFORMATIONS)
            e_expr = parse_expr(_clean_expr(expected_answer), local_dict=PHYSICS_LOCALS, transformations=TRANSFORMATIONS)

            if simplify(u_expr - e_expr) == 0:
                return True

            # Assume parâmetros físicos positivos (resolve sqrt(g*h) == sqrt(g)*sqrt(h), sqrt(v**2) == v)
            try:
                (u_pos, e_pos), _ = posify([u_expr, e_expr])
                if simplify(u_pos - e_pos) == 0:
                    return True
            except Exception:
                pass

            if bool(u_expr.equals(e_expr)):
                return True

            return _numeric_algebraic_equiv(u_expr, e_expr)
    except Exception:
        return False
    return False


@app.get("/")
def health_check():
    return {"status": "online", "service": "NOIC League SymPy Judge"}


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
            cur.execute(
                """
                INSERT INTO rating_history (user_id, old_rating, new_rating, delta)
                VALUES (%s, %s, %s, 0)
                """,
                (user["id"], user["rating"], user["rating"]),
            )
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


@app.get("/users/{username}")
def get_user_profile(username: str, conn=Depends(get_db)):
    cat_expr = normalized_category_sql("p.category")
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, username, rating, max_rating, solved_count
            FROM users
            WHERE LOWER(username) = LOWER(%s)
            """,
            (username.strip(),),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Competidor não encontrado.")

        cur.execute(
            """
            SELECT rh.id, rh.old_rating, rh.new_rating, rh.delta, rh.created_at,
                   p.irodov_code AS problem_code, p.title AS problem_title
            FROM rating_history rh
            LEFT JOIN problems p ON p.id = rh.problem_id
            WHERE rh.user_id = %s
            ORDER BY rh.created_at ASC
            """,
            (user["id"],),
        )
        history = cur.fetchall()

        cur.execute(
            f"""
            SELECT {cat_expr} AS category,
                   COUNT(DISTINCT p.id) AS count
            FROM submissions s
            JOIN problems p ON p.id = s.problem_id
            WHERE s.user_id = %s AND s.verdict = 'AC'
            GROUP BY 1
            ORDER BY count DESC, 1 ASC
            """,
            (user["id"],),
        )
        category_stats = cur.fetchall()

        cur.execute(
            f"""
            SELECT s.id, s.problem_id, s.verdict, s.created_at,
                   p.irodov_code AS problem_code, p.title AS problem_title,
                   {cat_expr} AS category, p.difficulty_rating, p.source, p.olympiad_id
            FROM submissions s
            JOIN problems p ON p.id = s.problem_id
            WHERE s.user_id = %s
            ORDER BY s.created_at DESC
            LIMIT 25
            """,
            (user["id"],),
        )
        recent_submissions = cur.fetchall()

    return {
        "user": user,
        "rating_history": history,
        "category_stats": category_stats,
        "recent_submissions": recent_submissions,
    }


@app.get("/problems")
def list_problems(source: str = "irodov", conn=Depends(get_db)):
    cat_expr = normalized_category_sql("category")
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, irodov_code, title,
                   {cat_expr} AS category,
                   category AS raw_category,
                   difficulty_rating, statement_latex, svg_diagram, figure_url,
                   answer_type, unit, variables_hint, source, olympiad_id
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


@app.get("/categories")
def list_categories(conn=Depends(get_db)):
    cat_expr = normalized_category_sql("category")
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {cat_expr} AS category,
                   COUNT(*) AS count
            FROM problems
            GROUP BY 1
            ORDER BY count DESC, 1 ASC
            """
        )
        return cur.fetchall()


@app.get("/problemset")
def filter_problemset(
    category: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    sort: str = "rating_asc",
    conn=Depends(get_db),
):
    cat_expr = normalized_category_sql("category")
    conditions = ["1=1"]
    params = []

    if category and category.lower() != "all":
        conditions.append(f"LOWER({cat_expr}) = LOWER(%s)")
        params.append(category.strip())

    if source and source.lower() != "all":
        if source.lower() == "olympiads":
            conditions.append("olympiad_id IS NOT NULL")
        else:
            conditions.append("LOWER(source) = LOWER(%s)")
            params.append(source.strip())

    if search and search.strip():
        conditions.append("(title ILIKE %s OR irodov_code ILIKE %s OR category ILIKE %s)")
        like = f"%{search.strip()}%"
        params.extend([like, like, like])

    if min_rating is not None:
        conditions.append("difficulty_rating >= %s")
        params.append(min_rating)

    if max_rating is not None:
        conditions.append("difficulty_rating <= %s")
        params.append(max_rating)

    order_map = {
        "rating_asc": "difficulty_rating ASC, irodov_code ASC",
        "rating_desc": "difficulty_rating DESC, irodov_code ASC",
        "code": "irodov_code ASC",
    }
    order_by = order_map.get(sort, order_map["rating_asc"])

    query = f"""
        SELECT id, irodov_code, title,
               {cat_expr} AS category,
               category AS raw_category,
               difficulty_rating, statement_latex, svg_diagram, figure_url,
               answer_type, unit, variables_hint, source, olympiad_id
        FROM problems
        WHERE {' AND '.join(conditions)}
        ORDER BY {order_by}
        LIMIT 300
    """
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


@app.get("/olympiads")
def list_olympiads(conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, competition, year, title, duration_minutes
            FROM olympiads
            ORDER BY competition ASC, year DESC
            """
        )
        return cur.fetchall()


@app.get("/olympiads/{olympiad_id}/problems")
def list_olympiad_problems(olympiad_id: str, conn=Depends(get_db)):
    cat_expr = normalized_category_sql("category")
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, irodov_code, title,
                   {cat_expr} AS category,
                   category AS raw_category,
                   difficulty_rating, statement_latex, svg_diagram, figure_url,
                   answer_type, unit, variables_hint, source, olympiad_id
            FROM problems
            WHERE olympiad_id = %s
            ORDER BY irodov_code ASC
            """,
            (olympiad_id,),
        )
        return cur.fetchall()


@app.get("/problems/{problem_id}/editorial")
def get_editorial(problem_id: str, user_id: str = Depends(get_current_user_id), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT answer_type, editorial_latex FROM problems WHERE id = %s", (problem_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Problema não encontrado.")

        if row["answer_type"] != "self_graded":
            cur.execute(
                "SELECT 1 FROM submissions WHERE user_id = %s AND problem_id = %s AND verdict = 'AC'",
                (user_id, problem_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Resolva o problema primeiro para desbloquear o editorial.")

        return {"editorial_latex": row["editorial_latex"] or ""}


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
            LIMIT 200
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

        is_self_graded = problem["answer_type"] == "self_graded"

        if is_self_graded:
            if req.self_verdict not in ("AC", "WA"):
                raise HTTPException(
                    status_code=400,
                    detail="Informe self_verdict ('AC' ou 'WA') para questões de autoavaliação.",
                )
            is_correct = req.self_verdict == "AC"
            verdict = req.self_verdict
            submitted_text = req.answer.strip() or f"[Autoavaliação: {verdict}]"
        else:
            is_correct = check_answer(
                req.answer,
                problem["expected_answer"],
                problem["answer_type"],
                problem.get("tolerance") or 0.02,
                problem.get("unit") or "",
            )
            verdict = "AC" if is_correct else "WA"
            submitted_text = req.answer

        cur.execute("SELECT rating FROM users WHERE id = %s", (user_id,))
        old_rating = cur.fetchone()["rating"]

        if problem.get("olympiad_id") is None and not is_self_graded:
            cur.execute(
                "SELECT apply_physelo_update(%s::uuid, %s::uuid, %s) AS new_rating",
                (user_id, req.problem_id, is_correct),
            )
            new_rating = cur.fetchone()["new_rating"]
            delta = new_rating - old_rating
            cur.execute(
                """
                INSERT INTO rating_history (user_id, problem_id, old_rating, new_rating, delta)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, req.problem_id, old_rating, new_rating, delta),
            )
        else:
            new_rating = old_rating

        cur.execute(
            """
            INSERT INTO submissions (user_id, problem_id, submitted_answer, verdict)
            VALUES (%s, %s, %s, %s)
            RETURNING id, problem_id, submitted_answer, verdict, created_at
            """,
            (user_id, req.problem_id, submitted_text, verdict),
        )
        sub = cur.fetchone()
        conn.commit()

    return {"verdict": verdict, "new_rating": new_rating, "submission": sub}

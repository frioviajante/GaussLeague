CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Usuários e Rating PhysElo
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rating INT NOT NULL DEFAULT 1200,
    max_rating INT NOT NULL DEFAULT 1200,
    solved_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Acervo de Problemas do Irodov
CREATE TABLE IF NOT EXISTS problems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    irodov_code VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    difficulty_rating INT NOT NULL DEFAULT 1200,
    statement_latex TEXT NOT NULL,
    svg_diagram TEXT,
    answer_type VARCHAR(20) NOT NULL CHECK (answer_type IN ('numeric', 'algebraic')),
    expected_answer TEXT NOT NULL,
    tolerance DOUBLE PRECISION DEFAULT 0.02,
    unit VARCHAR(50),
    variables_hint TEXT,
    editorial_latex TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Submissões
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    submitted_answer TEXT NOT NULL,
    verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('AC', 'WA', 'PE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_problem ON submissions(user_id, problem_id);

-- 4. Procedure de Atualização Dinâmica de Rating (PhysElo)
CREATE OR REPLACE FUNCTION apply_physelo_update(
    p_user_id UUID,
    p_problem_id UUID,
    p_is_solved BOOLEAN
) RETURNS INT AS $$
DECLARE
    v_user_rating DOUBLE PRECISION;
    v_prob_rating DOUBLE PRECISION;
    v_expected_user DOUBLE PRECISION;
    v_actual_score DOUBLE PRECISION;
    v_new_user_rating INT;
    v_new_prob_rating INT;
    v_already_solved BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM submissions
        WHERE user_id = p_user_id AND problem_id = p_problem_id AND verdict = 'AC'
    ) INTO v_already_solved;

    SELECT rating INTO v_user_rating FROM users WHERE id = p_user_id;
    IF v_already_solved THEN
        RETURN v_user_rating::INT;
    END IF;

    SELECT difficulty_rating INTO v_prob_rating FROM problems WHERE id = p_problem_id;

    v_expected_user := 1.0 / (1.0 + POWER(10.0, (v_prob_rating - v_user_rating) / 400.0));
    v_actual_score := CASE WHEN p_is_solved THEN 1.0 ELSE 0.0 END;

    v_new_user_rating := ROUND(v_user_rating + 32.0 * (v_actual_score - v_expected_user));
    v_new_prob_rating := ROUND(v_prob_rating + 16.0 * (v_expected_user - v_actual_score));

    UPDATE users
    SET rating = v_new_user_rating,
        max_rating = GREATEST(max_rating, v_new_user_rating),
        solved_count = solved_count + (CASE WHEN p_is_solved THEN 1 ELSE 0 END)
    WHERE id = p_user_id;

    UPDATE problems
    SET difficulty_rating = v_new_prob_rating
    WHERE id = p_problem_id;

    RETURN v_new_user_rating;
END;
$$ LANGUAGE plpgsql;

-- 5. Seed Inicial com Questões Clássicas (Parafraseadas)
INSERT INTO problems (irodov_code, title, category, difficulty_rating, statement_latex, svg_diagram, answer_type, expected_answer, unit, variables_hint, editorial_latex)
VALUES
(
    '1.14',
    'Encontro de Dois Projéteis no Plano Vertical',
    'Mecânica',
    1300,
    'Dois corpos são lançados simultaneamente a partir de um mesmo ponto no solo: um verticalmente para cima com velocidade inicial $v_0$ e outro sob um ângulo $\theta$ com a horizontal, também com módulo de velocidade inicial $v_0$. Desprezando a resistência do ar, determine a distância $d$ entre os dois corpos após um intervalo de tempo $t$ (antes que atinjam o solo).',
    '<svg viewBox="0 0 320 150" class="w-full max-w-sm h-36"><line x1="20" y1="130" x2="300" y2="130" stroke="#475569" stroke-width="2"/><circle cx="60" cy="130" r="4" fill="#6366f1"/><line x1="60" y1="130" x2="60" y2="45" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/><line x1="60" y1="130" x2="135" y2="75" stroke="#f59e0b" stroke-width="2"/><path d="M 90 130 A 30 30 0 0 0 84 112" fill="none" stroke="#94a3b8" stroke-width="1.5"/><text x="95" y="122" fill="#cbd5e1" font-size="12">θ</text><text x="40" y="42" fill="#38bdf8" font-size="12">v₀</text><text x="140" y="72" fill="#f59e0b" font-size="12">v₀</text></svg>',
    'algebraic',
    'v_0 * t * sqrt(2 * (1 - sin(theta)))',
    NULL,
    'v_0, t, theta',
    'No referencial do primeiro projétil, ambos sofrem exatamente a mesma aceleração gravitacional $\vec{g}$. Portanto, a aceleração relativa entre eles é nula ($\vec{a}_{rel} = \vec{0}$), e o movimento relativo é retilíneo e uniforme com velocidade relativa de módulo: $$v_{rel} = \sqrt{v_0^2 + v_0^2 - 2 v_0^2 \cos(\frac{\pi}{2} - \theta)} = v_0 \sqrt{2(1 - \sin\theta)}$$ Multiplicando pelo tempo $t$, obtemos $d = v_0 t \sqrt{2(1 - \sin\theta)}$.'
),
(
    '1.84',
    'Deslizamento sobre uma Esfera Lisa',
    'Mecânica',
    1450,
    'Uma pequena partícula começa a deslizar do repouso a partir do ponto mais alto de uma esfera fixa e perfeitamente lisa de raio $R$. Determine a altura $h$ (medida a partir do centro da esfera) na qual a partícula perde o contato com a superfície esférica.',
    '<svg viewBox="0 0 260 170" class="w-full max-w-xs h-40"><circle cx="130" cy="95" r="55" fill="none" stroke="#6366f1" stroke-width="2"/><circle cx="130" cy="40" r="4" fill="#f59e0b"/><line x1="130" y1="95" x2="172" y2="59" stroke="#94a3b8" stroke-dasharray="4"/><text x="145" y="72" fill="#cbd5e1" font-size="12">R</text></svg>',
    'algebraic',
    '2 * R / 3',
    NULL,
    'R',
    'Seja $\alpha$ o ângulo formado com a vertical no instante em que a reação normal $N$ se anula. Pela conservação da energia mecânica: $$mgR(1 - \cos\alpha) = \frac{1}{2}mv^2$$ Pela segunda lei de Newton na direção radial ($N = 0$): $$mg\cos\alpha = \frac{mv^2}{R}$$ Substituindo $mv^2 = mgR\cos\alpha$ na equação de energia, obtemos $\cos\alpha = \frac{2}{3}$. Logo, a altura em relação ao centro é $h = R\cos\alpha = \frac{2}{3}R$.'
),
(
    '3.12',
    'Força Eletrostática em Anel Carregado',
    'Eletrodinâmica',
    1600,
    'Um anel fino de raio $R$ possui uma carga elétrica $q$ uniformemente distribuída ao longo de seu perímetro. Uma carga puntiforme $q_0$ está localizada sobre o eixo de simetria do anel a uma distância $x$ do seu centro. Encontre o valor da razão $x/R$ para o qual a força eletrostática sobre $q_0$ atinge seu valor máximo.',
    NULL,
    'algebraic',
    '1 / sqrt(2)',
    NULL,
    'Apenas constantes numéricas (ex: 1/sqrt(2))',
    'O campo elétrico sobre o eixo de um anel uniformemente carregado é dado por: $$E(x) = \frac{1}{4\pi\varepsilon_0} \frac{q x}{(R^2 + x^2)^{3/2}}$$ Derivando $E(x)$ em relação a $x$ e igualando a zero: $$\frac{dE}{dx} = 0 \implies (R^2 + x^2)^{3/2} - x \cdot \frac{3}{2}(R^2 + x^2)^{1/2}(2x) = 0 \implies R^2 - 2x^2 = 0$$ Portanto, $\frac{x}{R} = \frac{1}{\sqrt{2}}$.'
)
ON CONFLICT (irodov_code) DO NOTHING;

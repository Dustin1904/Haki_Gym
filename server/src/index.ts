import "dotenv/config";
import express from "express";
import cors from "cors";
import type pg from "pg";
import { pool, initDb } from "./db.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

const port = Number(process.env.API_PORT ?? 3001);
/** Fecha local (misma idea que el cliente), no UTC. */
const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** 1=lunes … 7=domingo (ISODOW). */
const GYM_CLOSED_ISO_DOW = new Set([7]);

function isoDowFromIsoDate(isoDate: string): number | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const js = dt.getDay();
  return js === 0 ? 7 : js;
}

function isGymOpenOnDate(isoDate: string): boolean {
  const dow = isoDowFromIsoDate(isoDate);
  if (dow == null) return false;
  return !GYM_CLOSED_ISO_DOW.has(dow);
}
const MAX_COMPANIONS = 8;

const EXERCISE_KEYS = new Set([
  "biceps",
  "triceps",
  "piernas",
  "pecho",
  "espalda",
  "hombros",
  "abdomen",
  "gluteos",
  "antebrazos",
  "cardio",
]);

function parseExerciseKeys(raw: unknown): { ok: true; keys: string[] } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !EXERCISE_KEYS.has(item)) return { ok: false };
    if (!keys.includes(item)) keys.push(item);
  }
  return { ok: true, keys };
}

async function workoutsByDateForRange(
  memberId: number,
  start: string,
  endExclusive: string
): Promise<Record<string, string[]>> {
  const r = await pool.query(
    `
    SELECT visit_date::text AS visit_date, exercise_key
    FROM visit_exercises
    WHERE member_id = $1
      AND visit_date >= $2::date
      AND visit_date < $3::date
    ORDER BY visit_date, exercise_key
  `,
    [memberId, start, endExclusive]
  );
  const map: Record<string, string[]> = {};
  for (const row of r.rows) {
    const d = isoDateFromPg(row.visit_date) || String(row.visit_date).slice(0, 10);
    if (!map[d]) map[d] = [];
    map[d].push(String(row.exercise_key));
  }
  return map;
}

/** Fechas DATE de node-pg suelen ser `Date`; hay que normalizar a YYYY-MM-DD. */
function isoDateFromPg(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

const BODY_MEASURE_FIELDS = [
  "height_cm",
  "weight_kg",
  "neck_cm",
  "waist_cm",
  "hip_cm",
] as const;

function parseOptionalMeasure(
  value: unknown,
  max: number
): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseOptionalBirthDate(
  value: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false };
  return { ok: true, value: value };
}

function parseBodyMeasuresPayload(
  body: Record<string, unknown> | null | undefined,
  { partial }: { partial: boolean }
):
  | { error: string }
  | {
      values: {
        height_cm: number | null;
        weight_kg: number | null;
        birth_date: string | null;
        neck_cm: number | null;
        waist_cm: number | null;
        hip_cm: number | null;
      };
    } {
  const src = body ?? {};
  const result = {
    height_cm: null as number | null,
    weight_kg: null as number | null,
    birth_date: null as string | null,
    neck_cm: null as number | null,
    waist_cm: null as number | null,
    hip_cm: null as number | null,
  };

  for (const field of BODY_MEASURE_FIELDS) {
    const present = Object.prototype.hasOwnProperty.call(src, field);
    if (partial && !present) continue;
    const raw = present ? src[field] : undefined;
    if (!partial && (raw === undefined || raw === null || raw === "")) continue;
    const parsed = parseOptionalMeasure(present ? raw : null, field === "height_cm" ? 280 : 500);
    if (!parsed.ok) return { error: "Medida corporal inválida." };
    result[field] = parsed.value;
  }

  const birthPresent = Object.prototype.hasOwnProperty.call(src, "birth_date");
  if (!partial || birthPresent) {
    const rawBirth = birthPresent ? src.birth_date : partial ? undefined : null;
    if (rawBirth !== undefined) {
      const parsedBirth = parseOptionalBirthDate(rawBirth);
      if (!parsedBirth.ok) return { error: "Fecha de nacimiento inválida." };
      result.birth_date = parsedBirth.value;
    }
  }

  return { values: result };
}

function memberRowToJson(row: Record<string, unknown>) {
  return {
    ...row,
    joined_on: isoDateFromPg(row.joined_on),
    birth_date: row.birth_date != null && row.birth_date !== "" ? isoDateFromPg(row.birth_date) : null,
    height_cm: row.height_cm != null ? Number(row.height_cm) : null,
    weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
    neck_cm: row.neck_cm != null ? Number(row.neck_cm) : null,
    waist_cm: row.waist_cm != null ? Number(row.waist_cm) : null,
    hip_cm: row.hip_cm != null ? Number(row.hip_cm) : null,
  };
}

function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const endExclusive =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end, endExclusive };
}

function addDateRangeToSet(set: Set<string>, fromIso: string, toIso: string) {
  let cur = fromIso;
  while (cur <= toIso) {
    set.add(cur);
    const d = new Date(`${cur}T12:00:00`);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    cur = `${y}-${mo}-${day}`;
  }
}

type CoveragePeriod = {
  kind: "membership" | "day_visit";
  start: string;
  end: string | null;
  label: string;
};

async function eligibleAttendanceDates(memberId: number, yearMonth: string) {
  const { start, end, endExclusive } = monthRange(yearMonth);
  const [memberships, dayVisits] = await Promise.all([
    pool.query(
      `
      SELECT
        to_char(start_date, 'YYYY-MM-DD') AS start_date,
        to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM memberships
      WHERE member_id = $1
        AND status = 'active'
        AND start_date < $2::date
        AND end_date >= $3::date
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `,
      [memberId, endExclusive, start]
    ),
    pool.query(
      `
      SELECT to_char(payment_date, 'YYYY-MM-DD') AS payment_date
      FROM payments
      WHERE member_id = $1
        AND notes = 'Pago por visita'
        AND payment_date >= $2::date
        AND payment_date < $3::date
      ORDER BY payment_date, id
    `,
      [memberId, start, endExclusive]
    ),
  ]);

  const dates = new Set<string>();
  const coverage: CoveragePeriod[] = [];

  for (const ms of memberships.rows) {
    const s = isoDateFromPg(ms.start_date);
    const e = isoDateFromPg(ms.end_date);
    if (!s || !e) continue;
    const from = s < start ? start : s;
    const to = e > end ? end : e;
    if (from <= to) addDateRangeToSet(dates, from, to);
    coverage.push({
      kind: "membership",
      start: s,
      end: e,
      label: "Membresía mensual (vigente)",
    });
  }

  for (const p of dayVisits.rows) {
    const d = isoDateFromPg(p.payment_date);
    if (!d) continue;
    dates.add(d);
    coverage.push({
      kind: "day_visit",
      start: d,
      end: null,
      label: "Pago por día",
    });
  }

  return { dates: [...dates].filter(isGymOpenOnDate).sort(), coverage };
}

async function isAttendanceDateEligible(memberId: number, visitDate: string) {
  const { dates } = await eligibleAttendanceDates(memberId, visitDate.slice(0, 7));
  return dates.includes(visitDate);
}

type ParsedCompanion =
  | { kind: "existing"; member_id: number; price_cents: number; payment_method: string }
  | {
      kind: "new";
      first_name: string;
      last_name: string;
      gender: "male" | "female";
      phone: string;
      email: string;
      notes: string;
      price_cents: number;
      payment_method: string;
    };

function parseCompanionPayment(row: Record<string, unknown>): { error?: string; price_cents: number; payment_method: string } {
  const price = row.price;
  const hasPrice = price !== undefined && price !== null && price !== "";
  const priceNum = hasPrice ? Number(price) : NaN;
  if (!hasPrice || !Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
    return { error: "Indica un precio válido para cada acompañante.", price_cents: 0, payment_method: "cash" };
  }
  const paymentMethod = row.payment_method ?? "cash";
  if (paymentMethod !== "cash" && paymentMethod !== "transfer") {
    return { error: "Método de pago del acompañante inválido.", price_cents: 0, payment_method: "cash" };
  }
  return { price_cents: Math.round(priceNum * 100), payment_method: String(paymentMethod) };
}

function parseCompanions(raw: unknown): { error?: string; items: ParsedCompanion[] } {
  if (raw === undefined || raw === null) return { items: [] };
  if (!Array.isArray(raw)) return { error: "Lista de acompañantes inválida." };
  if (raw.length > MAX_COMPANIONS) {
    return { error: `Máximo ${MAX_COMPANIONS} acompañantes por período.` };
  }
  const items: ParsedCompanion[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== "object") return { error: "Acompañante inválido." };
    const record = row as Record<string, unknown>;
    const pay = parseCompanionPayment(record);
    if (pay.error) return { error: pay.error };

    const memberId = Number(record.member_id);
    if (Number.isSafeInteger(memberId) && memberId > 0) {
      items.push({
        kind: "existing",
        member_id: memberId,
        price_cents: pay.price_cents,
        payment_method: pay.payment_method,
      });
      continue;
    }
    const first = String(record.first_name ?? "").trim();
    const last = String(record.last_name ?? "").trim();
    const gender = record.gender;
    if (!first || !last) return { error: "Cada acompañante necesita nombre y apellido." };
    if (gender !== "male" && gender !== "female") {
      return { error: "Selecciona el género de cada acompañante." };
    }
    const phone = String(record.phone ?? "");
    const email = String(record.email ?? "");
    const notes = String(record.notes ?? "");
    if (![phone, email, notes].every((v) => typeof v === "string")) {
      return { error: "Datos de acompañante inválidos." };
    }
    items.push({
      kind: "new",
      first_name: first,
      last_name: last,
      gender,
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
      price_cents: pay.price_cents,
      payment_method: pay.payment_method,
    });
  }
  return { items };
}

/** Membresía mensual propia del acompañante (mismo período que el titular). */
async function activateCompanionMembership(
  client: pg.PoolClient,
  companionId: number,
  planId: number,
  startDate: string,
  endDate: string,
  priceCents: number,
  paymentMethod: string
) {
  await client.query(
    `UPDATE memberships SET status='expired' WHERE member_id=$1 AND status='active'`,
    [companionId]
  );
  const inserted = await client.query(
    `
    INSERT INTO memberships (member_id, plan_id, start_date, end_date, price_cents, payment_method, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'active')
    RETURNING id
  `,
    [companionId, planId, startDate, endDate, priceCents, paymentMethod]
  );
  const companionMembershipId = Number(inserted.rows[0].id);
  if (priceCents > 0) {
    await client.query(
      `
      INSERT INTO payments (member_id, membership_id, amount_cents, payment_date, method, notes)
      VALUES ($1, $2, $3, $4, $5, 'Membresía mensual')
    `,
      [companionId, companionMembershipId, priceCents, startDate, paymentMethod]
    );
  }
  return companionMembershipId;
}

async function attachCompanionsToMembership(
  client: pg.PoolClient,
  membershipId: number,
  primaryMemberId: number,
  joinedOn: string,
  companions: ParsedCompanion[]
) {
  const msResult = await client.query(
    `SELECT plan_id, start_date, end_date FROM memberships WHERE id = $1`,
    [membershipId]
  );
  const period = msResult.rows[0];
  if (!period) throw new Error("MEMBERSHIP_NOT_FOUND");

  const linked = new Set<number>();
  for (const c of companions) {
    let companionId: number;
    const priceCents = c.price_cents;
    const paymentMethod = c.payment_method;
    if (c.kind === "existing") {
      if (c.member_id === primaryMemberId) {
        throw new Error("DUPLICATE_PRIMARY");
      }
      const found = await client.query("SELECT id FROM members WHERE id=$1", [c.member_id]);
      if (!found.rowCount) throw new Error("COMPANION_NOT_FOUND");
      companionId = c.member_id;
      await client.query(`UPDATE members SET price_cents=$1, payment_method=$2 WHERE id=$3`, [
        priceCents,
        paymentMethod,
        companionId,
      ]);
    } else {
      const ins = await client.query(
        `
        INSERT INTO members (first_name, last_name, phone, email, joined_on, gender, price_cents, payment_method, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
        [
          c.first_name,
          c.last_name,
          c.phone,
          c.email,
          joinedOn,
          c.gender,
          priceCents,
          paymentMethod,
          c.notes,
        ]
      );
      companionId = Number(ins.rows[0].id);
    }
    if (linked.has(companionId)) continue;
    linked.add(companionId);
    await client.query(
      `
      INSERT INTO membership_companions (membership_id, companion_member_id)
      VALUES ($1, $2)
      ON CONFLICT (membership_id, companion_member_id) DO NOTHING
    `,
      [membershipId, companionId]
    );
    await activateCompanionMembership(
      client,
      companionId,
      period.plan_id,
      period.start_date,
      period.end_date,
      priceCents,
      paymentMethod
    );
  }
}

/** Ingresos al registrar usuario: membresía o pago por visita (sin tabla payments manual). */
const registeredPaymentsSql = `
  SELECT (3000000000 + p.id)::bigint AS id,
         p.payment_date,
         p.amount_cents,
         p.method,
         m.first_name || ' ' || m.last_name AS member_name,
         CASE
           WHEN p.notes = 'Membresía mensual (acompañante)' THEN 'Membresía (acompañante)'
           ELSE 'Membresía'
         END::text AS concept
  FROM payments p
  JOIN members m ON m.id = p.member_id
  WHERE p.notes IN ('Membresía mensual', 'Membresía mensual (acompañante)')

  UNION ALL

  SELECT (1000000000 + ms.id)::bigint AS id,
         ms.start_date AS payment_date,
         ms.price_cents AS amount_cents,
         ms.payment_method AS method,
         m.first_name || ' ' || m.last_name AS member_name,
         'Membresía'::text AS concept
  FROM memberships ms
  JOIN members m ON m.id = ms.member_id
  WHERE ms.price_cents > 0
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.membership_id = ms.id)

  UNION ALL

  SELECT (2000000000 + m.id)::bigint AS id,
         m.joined_on AS payment_date,
         m.price_cents AS amount_cents,
         m.payment_method AS method,
         m.first_name || ' ' || m.last_name AS member_name,
         'Pago por visita'::text AS concept
  FROM members m
  WHERE NOT EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = m.id)
    AND NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.member_id = m.id AND p.notes = 'Pago por visita'
    )

  UNION ALL

  SELECT (3000000000 + p.id)::bigint AS id,
         p.payment_date,
         p.amount_cents,
         p.method,
         m.first_name || ' ' || m.last_name AS member_name,
         'Pago por visita'::text AS concept
  FROM payments p
  JOIN members m ON m.id = p.member_id
  WHERE p.notes = 'Pago por visita'
`;

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT current_database() AS database, version() AS version");
    res.json({ ok: true, database: result.rows[0].database, version: result.rows[0].version });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ ok: false, error: "No se pudo conectar con PostgreSQL." });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [active, income, expiring, expiringList, recent] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM members WHERE status='active'"),
      pool.query(`
        SELECT COALESCE(SUM(amount_cents),0)::bigint AS n
        FROM (${registeredPaymentsSql}) registered
        WHERE date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)
      `),
      pool.query(`
        SELECT COUNT(*)::int AS n
        FROM memberships ms
        JOIN members m ON m.id = ms.member_id
        WHERE ms.status = 'active'
          AND m.status = 'active'
          AND ms.end_date >= CURRENT_DATE
          AND ms.end_date <= CURRENT_DATE + 7
      `),
      pool.query(`
        SELECT
          ms.id AS membership_id,
          ms.member_id,
          TRIM(m.first_name || ' ' || m.last_name) AS member_name,
          m.phone,
          to_char(ms.end_date, 'YYYY-MM-DD') AS end_date,
          (ms.end_date - CURRENT_DATE)::int AS days_left
        FROM memberships ms
        JOIN members m ON m.id = ms.member_id
        WHERE ms.status = 'active'
          AND m.status = 'active'
          AND ms.end_date >= CURRENT_DATE
          AND ms.end_date <= CURRENT_DATE + 7
        ORDER BY ms.end_date, m.last_name, m.first_name
      `),
      pool.query(`
        SELECT id, payment_date, amount_cents, method, member_name, concept
        FROM (${registeredPaymentsSql}) registered
        ORDER BY payment_date DESC, id DESC
        LIMIT 5
      `)
    ]);
    res.json({
      activeMembers: active.rows[0].n,
      incomeCents: Number(income.rows[0].n),
      expiringMemberships: expiring.rows[0].n,
      expiringSoon: expiringList.rows.map((row) => ({
        membership_id: Number(row.membership_id),
        member_id: Number(row.member_id),
        member_name: String(row.member_name),
        phone: String(row.phone ?? "").trim(),
        end_date: isoDateFromPg(row.end_date) || String(row.end_date).slice(0, 10),
        days_left: Number(row.days_left),
      })),
      recentPayments: recent.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el resumen." });
  }
});

app.get("/api/members", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*,
        ms.start_date AS membership_start,
        ms.end_date AS membership_end,
        ms.price_cents AS membership_price_cents
      FROM members m
      LEFT JOIN LATERAL (
        SELECT start_date, end_date, price_cents
        FROM memberships
        WHERE member_id = m.id AND status = 'active'
        ORDER BY end_date DESC, id DESC
        LIMIT 1
      ) ms ON true
      ORDER BY m.last_name, m.first_name
    `);
    res.json(result.rows.map((row) => memberRowToJson(row)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar los socios." });
  }
});

app.post("/api/members", async (req, res) => {
  const {
    first_name, last_name, phone = "", email = "", joined_on = today(), notes = "",
    price, gender, with_membership: withMembershipRaw, payment_method: paymentMethodRaw = "cash",
    companions: companionsRaw,
    height_cm,
    weight_kg,
    birth_date,
    neck_cm,
    waist_cm,
    hip_cm,
  } = req.body ?? {};
  const withMembership = withMembershipRaw === true;
  const companionParse = parseCompanions(companionsRaw);
  if (companionParse.error) return res.status(400).json({ error: companionParse.error });
  if (!withMembership && companionParse.items.length > 0) {
    return res.status(400).json({ error: "Los acompañantes solo aplican con membresía mensual." });
  }
  if (typeof first_name !== "string" || !first_name.trim() || typeof last_name !== "string" || !last_name.trim()) {
    return res.status(400).json({ error: "Nombre y apellido son obligatorios." });
  }
  if (gender !== "male" && gender !== "female") {
    return res.status(400).json({ error: "Selecciona el género." });
  }
  if (![phone, email, notes].every((v) => typeof v === "string") || typeof joined_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(joined_on)) {
    return res.status(400).json({ error: "Campos inválidos." });
  }
  const hasPrice = price !== undefined && price !== null && price !== "";
  const priceNum = hasPrice ? Number(price) : NaN;
  if (!hasPrice || !Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
    return res.status(400).json({ error: "Indica un precio válido." });
  }
  if (!["cash", "transfer"].includes(paymentMethodRaw)) {
    return res.status(400).json({ error: "Método de pago inválido." });
  }
  const memberPriceCents = Math.round(priceNum * 100);
  const measuresParse = parseBodyMeasuresPayload(
  {
      height_cm,
      weight_kg,
      birth_date,
      neck_cm,
      waist_cm,
      hip_cm,
    },
    { partial: false }
  );
  if ("error" in measuresParse) return res.status(400).json({ error: measuresParse.error });
  const measures = measuresParse.values;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const memberResult = await client.query(
      `
      INSERT INTO members (
        first_name,last_name,phone,email,joined_on,gender,price_cents,payment_method,notes,
        height_cm,weight_kg,birth_date,neck_cm,waist_cm,hip_cm
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `,
      [
        first_name.trim(),
        last_name.trim(),
        phone.trim(),
        email.trim(),
        joined_on,
        gender,
        memberPriceCents,
        paymentMethodRaw,
        notes.trim(),
        measures.height_cm,
        measures.weight_kg,
        measures.birth_date,
        measures.neck_cm,
        measures.waist_cm,
        measures.hip_cm,
      ]
    );
    const member = memberResult.rows[0];

    let newMembershipId: number | null = null;
    if (withMembership) {
      const planResult = await client.query(
        "SELECT id, price_cents FROM plans WHERE active = true ORDER BY id LIMIT 1"
      );
      const plan = planResult.rows[0];
      if (!plan) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "No hay un plan de membresía configurado." });
      }

      const ins = await client.query(
        `
        INSERT INTO memberships (member_id, plan_id, start_date, end_date, price_cents, payment_method, status)
        VALUES ($1, $2, $3, ($3::date + INTERVAL '1 month')::date, $4, $5, 'active')
        RETURNING id
      `,
        [member.id, plan.id, member.joined_on, memberPriceCents, paymentMethodRaw]
      );
      newMembershipId = ins.rows[0].id;
    }

    await client.query(
      `
      INSERT INTO payments (member_id, membership_id, amount_cents, payment_date, method, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        member.id,
        newMembershipId,
        memberPriceCents,
        member.joined_on,
        paymentMethodRaw,
        withMembership ? "Membresía mensual" : "Pago por visita",
      ]
    );

    if (withMembership && newMembershipId != null && companionParse.items.length > 0) {
      try {
        await attachCompanionsToMembership(
          client,
          newMembershipId,
          Number(member.id),
          member.joined_on,
          companionParse.items
        );
      } catch (err) {
        await client.query("ROLLBACK");
        if (err instanceof Error && err.message === "DUPLICATE_PRIMARY") {
          return res.status(400).json({ error: "Un acompañante no puede ser la misma persona titular." });
        }
        if (err instanceof Error && err.message === "COMPANION_NOT_FOUND") {
          return res.status(400).json({ error: "Acompañante no encontrado." });
        }
        if (err instanceof Error && err.message === "MEMBERSHIP_NOT_FOUND") {
          return res.status(500).json({ error: "No se encontró el período del titular." });
        }
        throw err;
      }
    }

    await client.query("COMMIT");
    res.status(201).json(memberRowToJson(member));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar el socio." });
  } finally {
    client.release();
  }
});

app.patch("/api/members/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  try {
    const found = await pool.query("SELECT * FROM members WHERE id=$1", [id]);
    const current = found.rows[0];
    if (!current) return res.status(404).json({ error: "Socio no encontrado." });
    const body = req.body ?? {};
    const { first_name, last_name, phone, email, status, notes, gender } = body;
    const next = {
      first_name: first_name ?? current.first_name,
      last_name: last_name ?? current.last_name,
      phone: phone ?? current.phone,
      email: email ?? current.email,
      status: status ?? current.status,
      notes: notes ?? current.notes,
      gender: gender ?? current.gender,
      height_cm: current.height_cm != null ? Number(current.height_cm) : null,
      weight_kg: current.weight_kg != null ? Number(current.weight_kg) : null,
      birth_date:
        current.birth_date != null && current.birth_date !== ""
          ? isoDateFromPg(current.birth_date)
          : null,
      neck_cm: current.neck_cm != null ? Number(current.neck_cm) : null,
      waist_cm: current.waist_cm != null ? Number(current.waist_cm) : null,
      hip_cm: current.hip_cm != null ? Number(current.hip_cm) : null,
    };
    const measuresPatch = parseBodyMeasuresPayload(body, { partial: true });
    if ("error" in measuresPatch) return res.status(400).json({ error: measuresPatch.error });
    for (const key of [
      "height_cm",
      "weight_kg",
      "birth_date",
      "neck_cm",
      "waist_cm",
      "hip_cm",
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const v = measuresPatch.values[key];
        next[key] = v;
      }
    }
    if (!String(next.first_name).trim() || !String(next.last_name).trim() ||
        !["active","inactive"].includes(next.status) ||
        !["male","female"].includes(next.gender) ||
        ![next.phone, next.email, next.notes].every((v) => typeof v === "string")) {
      return res.status(400).json({ error: "Datos inválidos." });
    }
    const result = await pool.query(`
      UPDATE members SET
        first_name=$1,last_name=$2,phone=$3,email=$4,status=$5,notes=$6,gender=$7,
        height_cm=$8,weight_kg=$9,birth_date=$10,neck_cm=$11,waist_cm=$12,hip_cm=$13
      WHERE id=$14 RETURNING *
    `, [
      String(next.first_name).trim(),
      String(next.last_name).trim(),
      next.phone,
      next.email,
      next.status,
      next.notes,
      next.gender,
      next.height_cm,
      next.weight_kg,
      next.birth_date,
      next.neck_cm,
      next.waist_cm,
      next.hip_cm,
      id,
    ]);
    res.json(memberRowToJson(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el socio." });
  }
});

app.get("/api/memberships", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT ms.id, ms.member_id, ms.start_date, ms.end_date, ms.status, ms.price_cents,
             m.first_name || ' ' || m.last_name AS member_name,
             m.notes AS member_notes,
             p.name AS plan_name,
             (SELECT COUNT(*)::int FROM membership_companions mc WHERE mc.membership_id = ms.id) AS companion_count,
             (
               SELECT string_agg(m2.first_name || ' ' || m2.last_name, ', ' ORDER BY mc.id)
               FROM membership_companions mc
               JOIN members m2 ON m2.id = mc.companion_member_id
               WHERE mc.membership_id = ms.id
             ) AS companion_names
      FROM memberships ms
      JOIN members m ON m.id = ms.member_id
      JOIN plans p ON p.id = ms.plan_id
      ORDER BY ms.end_date DESC, ms.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar las membresías." });
  }
});

app.patch("/api/memberships/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  try {
    const found = await pool.query("SELECT * FROM memberships WHERE id=$1", [id]);
    const current = found.rows[0];
    if (!current) return res.status(404).json({ error: "Membresía no encontrada." });

    const { start_date, end_date, price, status } = req.body ?? {};
    const nextStart = start_date ?? current.start_date;
    const nextEnd = end_date ?? current.end_date;
    const nextStatus = status ?? current.status;

    if (typeof nextStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(nextStart)) {
      return res.status(400).json({ error: "Fecha de inicio inválida." });
    }
    if (typeof nextEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(nextEnd)) {
      return res.status(400).json({ error: "Fecha de fin inválida." });
    }
    if (nextEnd < nextStart) return res.status(400).json({ error: "La fecha de fin debe ser posterior al inicio." });
    if (!["active", "expired", "cancelled"].includes(nextStatus)) {
      return res.status(400).json({ error: "Estado inválido." });
    }

    let priceCents = Number(current.price_cents);
    if (price !== undefined && price !== null && price !== "") {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
        return res.status(400).json({ error: "Precio inválido." });
      }
      priceCents = Math.round(priceNum * 100);
    }

    const result = await pool.query(
      `
      UPDATE memberships
      SET start_date=$1, end_date=$2, price_cents=$3, status=$4
      WHERE id=$5
      RETURNING *
    `,
      [nextStart, nextEnd, priceCents, nextStatus, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar la membresía." });
  }
});

/** Nuevo período mensual (renovar / reactivar tras inactividad). */
app.post("/api/memberships/renew", async (req, res) => {
  const memberId = Number(req.body?.member_id);
  const price = req.body?.price;
  const paymentMethod = req.body?.payment_method ?? "cash";
  const startDate = typeof req.body?.start_date === "string" ? req.body.start_date : today();
  const companionParse = parseCompanions(req.body?.companions);
  if (companionParse.error) return res.status(400).json({ error: companionParse.error });

  if (!Number.isSafeInteger(memberId) || memberId < 1) {
    return res.status(400).json({ error: "Usuario inválido." });
  }
  if (!["cash", "transfer"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return res.status(400).json({ error: "Fecha de inicio inválida." });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
    return res.status(400).json({ error: "Indica un precio válido." });
  }
  const priceCents = Math.round(priceNum * 100);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const member = await client.query("SELECT id FROM members WHERE id=$1", [memberId]);
    if (!member.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    await client.query(
      `UPDATE memberships SET status='expired'
       WHERE member_id=$1 AND status='active'`,
      [memberId]
    );

    await client.query(
      `UPDATE members SET price_cents=$1, payment_method=$2 WHERE id=$3`,
      [priceCents, paymentMethod, memberId]
    );

    const planResult = await client.query(
      "SELECT id FROM plans WHERE active = true ORDER BY id LIMIT 1"
    );
    const plan = planResult.rows[0];
    if (!plan) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "No hay un plan de membresía configurado." });
    }

    const inserted = await client.query(
      `
      INSERT INTO memberships (member_id, plan_id, start_date, end_date, price_cents, payment_method, status)
      VALUES ($1, $2, $3, ($3::date + INTERVAL '1 month')::date, $4, $5, 'active')
      RETURNING *
    `,
      [memberId, plan.id, startDate, priceCents, paymentMethod]
    );
    const newMs = inserted.rows[0];

    await client.query(
      `
      INSERT INTO payments (member_id, membership_id, amount_cents, payment_date, method, notes)
      VALUES ($1, $2, $3, $4, $5, 'Membresía mensual')
    `,
      [memberId, newMs.id, priceCents, startDate, paymentMethod]
    );

    if (companionParse.items.length > 0) {
      try {
        await attachCompanionsToMembership(
          client,
          Number(newMs.id),
          memberId,
          startDate,
          companionParse.items
        );
      } catch (err) {
        await client.query("ROLLBACK");
        if (err instanceof Error && err.message === "DUPLICATE_PRIMARY") {
          return res.status(400).json({ error: "Un acompañante no puede ser la misma persona titular." });
        }
        if (err instanceof Error && err.message === "COMPANION_NOT_FOUND") {
          return res.status(400).json({ error: "Acompañante no encontrado." });
        }
        if (err instanceof Error && err.message === "MEMBERSHIP_NOT_FOUND") {
          return res.status(500).json({ error: "No se encontró el período del titular." });
        }
        throw err;
      }
    }

    await client.query("COMMIT");
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "No se pudo renovar la membresía." });
  } finally {
    client.release();
  }
});

/** Otro pago por día (sin activar membresía mensual). */
app.post("/api/members/:id/day-visit", async (req, res) => {
  const memberId = Number(req.params.id);
  const price = req.body?.price;
  const paymentMethod = req.body?.payment_method ?? "cash";
  const paymentDate = typeof req.body?.payment_date === "string" ? req.body.payment_date : today();

  if (!Number.isSafeInteger(memberId) || memberId < 1) {
    return res.status(400).json({ error: "Usuario inválido." });
  }
  if (!["cash", "transfer"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return res.status(400).json({ error: "Fecha de pago inválida." });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
    return res.status(400).json({ error: "Indica un precio válido." });
  }
  const priceCents = Math.round(priceNum * 100);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const member = await client.query("SELECT id FROM members WHERE id=$1", [memberId]);
    if (!member.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    await client.query(`UPDATE members SET price_cents=$1, payment_method=$2 WHERE id=$3`, [
      priceCents,
      paymentMethod,
      memberId,
    ]);

    await client.query(
      `UPDATE memberships SET status='expired' WHERE member_id=$1 AND status='active'`,
      [memberId]
    );

    const payment = await client.query(
      `
      INSERT INTO payments (member_id, membership_id, amount_cents, payment_date, method, notes)
      VALUES ($1, NULL, $2, $3, $4, 'Pago por visita')
      RETURNING *
    `,
      [memberId, priceCents, paymentDate, paymentMethod]
    );

    await client.query("COMMIT");
    res.status(201).json(payment.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar el pago por visita." });
  } finally {
    client.release();
  }
});

app.get("/api/plans", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM plans ORDER BY name");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar los planes." });
  }
});

app.post("/api/plans", async (req, res) => {
  const { name, duration_days, price } = req.body ?? {};
  const days = Number(duration_days);
  const amount = Number(price);
  if (typeof name !== "string" || !name.trim() || !Number.isInteger(days) || days < 1 ||
      !Number.isFinite(amount) || amount < 0 || amount > 100000) {
    return res.status(400).json({ error: "Ingresa nombre, duración y precio válidos." });
  }
  try {
    const result = await pool.query(
      "INSERT INTO plans (name,duration_days,price_cents) VALUES ($1,$2,$3) RETURNING *",
      [name.trim(), days, Math.round(amount * 100)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "Ya existe un plan con ese nombre." });
    console.error(error);
    res.status(500).json({ error: "No se pudo crear el plan." });
  }
});

const PRODUCT_CATEGORIES = new Set(["bebidas", "suplementos", "otros"]);

function mapProductRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name),
    category: String(row.category),
    price_cents: Number(row.price_cents),
    active: Boolean(row.active),
    created_at: row.created_at,
  };
}

function mapProductSaleRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    product_name: String(row.product_name),
    product_category: String(row.product_category),
    quantity: Number(row.quantity),
    unit_price_cents: Number(row.unit_price_cents),
    amount_cents: Number(row.amount_cents),
    sale_date: isoDateFromPg(row.sale_date),
    method: String(row.method),
    member_id: row.member_id != null ? Number(row.member_id) : null,
    member_name: row.member_name != null ? String(row.member_name).trim() : null,
    notes: String(row.notes ?? ""),
    created_at: row.created_at,
  };
}

app.get("/api/products", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, category, price_cents, active, created_at
      FROM products
      ORDER BY active DESC, category, name
    `);
    res.json(result.rows.map((r) => mapProductRow(r)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el catálogo." });
  }
});

app.post("/api/products", async (req, res) => {
  const { name, category = "otros", price, active = false } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Indica el nombre del producto." });
  }
  if (!PRODUCT_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Categoría inválida." });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
    return res.status(400).json({ error: "Precio inválido." });
  }
  try {
    const result = await pool.query(
      `
      INSERT INTO products (name, category, price_cents, active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, category, price_cents, active, created_at
    `,
      [name.trim(), category, Math.round(priceNum * 100), active === true]
    );
    res.status(201).json(mapProductRow(result.rows[0]));
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") return res.status(409).json({ error: "Ya existe un producto con ese nombre." });
    console.error(error);
    res.status(500).json({ error: "No se pudo crear el producto." });
  }
});

app.patch("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  try {
    const found = await pool.query("SELECT * FROM products WHERE id=$1", [id]);
    const current = found.rows[0];
    if (!current) return res.status(404).json({ error: "Producto no encontrado." });
    const { name, category, price, active } = req.body ?? {};
    const next = {
      name: name ?? current.name,
      category: category ?? current.category,
      active: active !== undefined ? active === true : current.active,
      price_cents: current.price_cents,
    };
    if (!PRODUCT_CATEGORIES.has(next.category)) {
      return res.status(400).json({ error: "Categoría inválida." });
    }
    if (price !== undefined && price !== null && price !== "") {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000) {
        return res.status(400).json({ error: "Precio inválido." });
      }
      next.price_cents = Math.round(priceNum * 100);
    }
    if (!String(next.name).trim()) return res.status(400).json({ error: "Nombre inválido." });
    if (next.active && next.price_cents <= 0) {
      return res.status(400).json({ error: "Activa el producto solo con un precio mayor que cero." });
    }
    const result = await pool.query(
      `
      UPDATE products
      SET name=$1, category=$2, price_cents=$3, active=$4
      WHERE id=$5
      RETURNING id, name, category, price_cents, active, created_at
    `,
      [String(next.name).trim(), next.category, next.price_cents, next.active, id]
    );
    res.json(mapProductRow(result.rows[0]));
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") return res.status(409).json({ error: "Ya existe un producto con ese nombre." });
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el producto." });
  }
});

app.get("/api/product-sales", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ps.id,
        ps.product_id,
        p.name AS product_name,
        p.category AS product_category,
        ps.quantity,
        ps.unit_price_cents,
        ps.amount_cents,
        ps.sale_date,
        ps.method,
        ps.member_id,
        TRIM(m.first_name || ' ' || m.last_name) AS member_name,
        ps.notes,
        ps.created_at
      FROM product_sales ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN members m ON m.id = ps.member_id
      ORDER BY ps.sale_date DESC, ps.id DESC
    `);
    res.json(result.rows.map((r) => mapProductSaleRow(r)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar las ventas." });
  }
});

app.post("/api/product-sales", async (req, res) => {
  const {
    product_id: productIdRaw,
    quantity: quantityRaw = 1,
    sale_date: saleDateRaw = today(),
    method,
    member_id: memberIdRaw,
    notes = "",
  } = req.body ?? {};
  const productId = Number(productIdRaw);
  const quantity = Number(quantityRaw);
  const memberId =
    memberIdRaw === null || memberIdRaw === "" || memberIdRaw === undefined
      ? null
      : Number(memberIdRaw);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: "Selecciona un producto." });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return res.status(400).json({ error: "Cantidad inválida." });
  }
  if (!["cash", "transfer"].includes(method)) {
    return res.status(400).json({ error: "Método de pago inválido." });
  }
  if (typeof saleDateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(saleDateRaw)) {
    return res.status(400).json({ error: "Fecha inválida." });
  }
  if (saleDateRaw > today()) return res.status(400).json({ error: "No registres ventas en el futuro." });
  if (memberId != null && (!Number.isSafeInteger(memberId) || memberId < 1)) {
    return res.status(400).json({ error: "Socio inválido." });
  }
  if (typeof notes !== "string") return res.status(400).json({ error: "Notas inválidas." });
  try {
    const product = await pool.query(
      "SELECT id, price_cents, active FROM products WHERE id=$1",
      [productId]
    );
    const p = product.rows[0];
    if (!p) return res.status(404).json({ error: "Producto no encontrado." });
    if (!p.active || Number(p.price_cents) <= 0) {
      return res.status(400).json({ error: "Este producto no está disponible para la venta." });
    }
    if (memberId != null) {
      const member = await pool.query("SELECT id FROM members WHERE id=$1", [memberId]);
      if (!member.rowCount) return res.status(400).json({ error: "Socio no encontrado." });
    }
    const unit = Number(p.price_cents);
    const amount = unit * quantity;
    const ins = await pool.query(
      `
      INSERT INTO product_sales (
        product_id, quantity, unit_price_cents, amount_cents, sale_date, method, member_id, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
      [productId, quantity, unit, amount, saleDateRaw, method, memberId, notes.trim()]
    );
    const saleId = ins.rows[0].id;
    const row = await pool.query(
      `
      SELECT
        ps.id,
        ps.product_id,
        p.name AS product_name,
        p.category AS product_category,
        ps.quantity,
        ps.unit_price_cents,
        ps.amount_cents,
        ps.sale_date,
        ps.method,
        ps.member_id,
        TRIM(m.first_name || ' ' || m.last_name) AS member_name,
        ps.notes,
        ps.created_at
      FROM product_sales ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN members m ON m.id = ps.member_id
      WHERE ps.id = $1
    `,
      [saleId]
    );
    res.status(201).json(mapProductSaleRow(row.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar la venta." });
  }
});

app.delete("/api/product-sales/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  try {
    const result = await pool.query("DELETE FROM product_sales WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Venta no encontrada." });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar la venta." });
  }
});

const EXERCISE_LABELS: Record<string, string> = {
  biceps: "Bíceps",
  triceps: "Tríceps",
  piernas: "Piernas",
  pecho: "Pecho",
  espalda: "Espalda",
  hombros: "Hombros",
  abdomen: "Abdomen",
  gluteos: "Glúteos",
  antebrazos: "Antebrazos",
  cardio: "Cardio",
};

const WEEKDAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

app.get("/api/reports/monthly", async (req, res) => {
  const monthRaw = typeof req.query.month === "string" ? req.query.month : today().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthRaw)) return res.status(400).json({ error: "Mes inválido (use YYYY-MM)." });
  const { start, endExclusive } = monthRange(monthRaw);
  try {
    const [
      membershipIncome,
      productIncome,
      visitTotals,
      visitsByDate,
      exerciseStats,
      genderStats,
    ] = await Promise.all([
      pool.query(
        `
        SELECT COALESCE(SUM(amount_cents), 0)::bigint AS n
        FROM (${registeredPaymentsSql}) registered
        WHERE payment_date >= $1::date AND payment_date < $2::date
      `,
        [start, endExclusive]
      ),
      pool.query(
        `
        SELECT COALESCE(SUM(amount_cents), 0)::bigint AS n
        FROM product_sales
        WHERE sale_date >= $1::date AND sale_date < $2::date
      `,
        [start, endExclusive]
      ),
      pool.query(
        `
        SELECT
          COUNT(*)::int AS total_visits,
          COUNT(DISTINCT member_id)::int AS unique_members
        FROM attendance
        WHERE visit_date >= $1::date AND visit_date < $2::date
      `,
        [start, endExclusive]
      ),
      pool.query(
        `
        SELECT visit_date::text AS visit_date, COUNT(*)::int AS visit_count
        FROM attendance
        WHERE visit_date >= $1::date AND visit_date < $2::date
        GROUP BY visit_date
        ORDER BY visit_date
      `,
        [start, endExclusive]
      ),
      pool.query(
        `
        SELECT exercise_key, COUNT(*)::int AS n
        FROM visit_exercises
        WHERE visit_date >= $1::date AND visit_date < $2::date
        GROUP BY exercise_key
        ORDER BY n DESC, exercise_key
      `,
        [start, endExclusive]
      ),
      pool.query(`
        SELECT gender, COUNT(*)::int AS n
        FROM members
        WHERE status = 'active'
        GROUP BY gender
      `),
    ]);

    const membershipCents = Number(membershipIncome.rows[0]?.n ?? 0);
    const productCents = Number(productIncome.rows[0]?.n ?? 0);
    const totals = visitTotals.rows[0];
    let male = 0;
    let female = 0;
    for (const row of genderStats.rows) {
      if (row.gender === "male") male = Number(row.n);
      else if (row.gender === "female") female = Number(row.n);
    }

    const by_date = visitsByDate.rows.map((r) => ({
      date: isoDateFromPg(r.visit_date) || String(r.visit_date).slice(0, 10),
      visit_count: Number(r.visit_count),
    }));

    const weekdayDetail = new Map<
      number,
      { visit_count: number; dates: { date: string; visit_count: number }[] }
    >();
    for (let dow = 1; dow <= 7; dow++) {
      weekdayDetail.set(dow, { visit_count: 0, dates: [] });
    }
    let visits_on_closed_days = 0;
    let total_visits_open = 0;
    for (const row of by_date) {
      const dow = isoDowFromIsoDate(row.date);
      if (dow == null) continue;
      const open = isGymOpenOnDate(row.date);
      const bucket = weekdayDetail.get(dow)!;
      bucket.dates.push(row);
      if (open) {
        bucket.visit_count += row.visit_count;
        total_visits_open += row.visit_count;
      } else {
        visits_on_closed_days += row.visit_count;
      }
    }

    const visits_by_weekday = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const detail = weekdayDetail.get(dow)!;
      const closed = GYM_CLOSED_ISO_DOW.has(dow);
      return {
        weekday: dow,
        label: closed ? `${WEEKDAY_LABELS[dow]} (cerrado)` : WEEKDAY_LABELS[dow] ?? `Día ${dow}`,
        visit_count: closed ? 0 : detail.visit_count,
        raw_visit_count: detail.visit_count,
        closed,
        dates: detail.dates,
      };
    });

    res.json({
      year_month: monthRaw,
      income: {
        total_cents: membershipCents + productCents,
        membership_cents: membershipCents,
        product_cents: productCents,
      },
      attendance: {
        total_visits: total_visits_open,
        total_visits_raw: Number(totals?.total_visits ?? 0),
        visits_on_closed_days,
        unique_members: Number(totals?.unique_members ?? 0),
        by_date,
        by_weekday: visits_by_weekday,
      },
      exercises: exerciseStats.rows.map((r) => ({
        key: String(r.exercise_key),
        label: EXERCISE_LABELS[String(r.exercise_key)] ?? String(r.exercise_key),
        count: Number(r.n),
      })),
      members: {
        total_active: male + female,
        male,
        female,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo generar el reporte." });
  }
});

app.get("/api/payments", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, payment_date, amount_cents, method, member_name, concept
      FROM (${registeredPaymentsSql}) registered
      ORDER BY payment_date DESC, id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar los pagos." });
  }
});

app.post("/api/payments", async (req, res) => {
  const { member_id, amount, payment_date = today(), method, reference = "", notes = "", membership_id = null } = req.body ?? {};
  const memberId = Number(member_id);
  const amountNum = Number(amount);
  if (!Number.isSafeInteger(memberId) || memberId < 1) return res.status(400).json({ error: "Selecciona un socio válido." });
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 1000000) return res.status(400).json({ error: "El monto debe ser mayor que cero." });
  if (!["cash","transfer"].includes(method)) return res.status(400).json({ error: "Método de pago inválido." });
  if (typeof payment_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) return res.status(400).json({ error: "Fecha inválida." });
  try {
    const member = await pool.query("SELECT id FROM members WHERE id=$1", [memberId]);
    if (!member.rowCount) return res.status(400).json({ error: "Selecciona un socio válido." });
    const membershipId = membership_id === null || membership_id === "" ? null : Number(membership_id);
    const result = await pool.query(`
      INSERT INTO payments (member_id,membership_id,amount_cents,payment_date,method,reference,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [memberId, membershipId, Math.round(amountNum * 100), payment_date, method, String(reference), String(notes)]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar el pago. Verifica el socio y la membresía." });
  }
});

app.get("/api/attendance/summary", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        m.id AS member_id,
        m.first_name || ' ' || m.last_name AS member_name,
        COALESCE(
          ms.start_date,
          (
            SELECT p.payment_date FROM payments p
            WHERE p.member_id = m.id AND p.notes = 'Pago por visita'
            ORDER BY p.payment_date DESC, p.id DESC
            LIMIT 1
          ),
          m.joined_on
        ) AS current_start,
        ms.end_date AS current_end,
        COALESCE(
          ms.price_cents,
          (
            SELECT p.amount_cents FROM payments p
            WHERE p.member_id = m.id AND p.notes = 'Pago por visita'
            ORDER BY p.payment_date DESC, p.id DESC
            LIMIT 1
          ),
          m.price_cents
        ) AS current_price_cents,
        COALESCE(
          (
            SELECT p.method FROM payments p
            WHERE p.membership_id = ms.id
            ORDER BY p.id DESC
            LIMIT 1
          ),
          (
            SELECT p.method FROM payments p
            WHERE p.member_id = m.id AND p.notes = 'Pago por visita'
            ORDER BY p.payment_date DESC, p.id DESC
            LIMIT 1
          ),
          m.payment_method
        ) AS current_method,
        CASE
          WHEN ms.id IS NOT NULL THEN 'membership'
          ELSE 'day_visit'
        END AS current_kind,
        (
          SELECT COUNT(*)::int FROM memberships WHERE member_id = m.id
        ) + (
          SELECT COUNT(*)::int FROM payments WHERE member_id = m.id AND notes = 'Pago por visita'
        ) + CASE
          WHEN NOT EXISTS (SELECT 1 FROM memberships WHERE member_id = m.id)
               AND NOT EXISTS (SELECT 1 FROM payments WHERE member_id = m.id AND notes = 'Pago por visita')
               AND m.price_cents > 0 THEN 1
          ELSE 0
        END AS history_count,
        CASE
          WHEN ms.id IS NOT NULL THEN (
            SELECT COUNT(*)::int FROM membership_companions mc WHERE mc.membership_id = ms.id
          )
          ELSE 0
        END AS companion_count,
        CASE
          WHEN ms.id IS NOT NULL THEN (
            SELECT string_agg(m2.first_name || ' ' || m2.last_name, ', ' ORDER BY mc.id)
            FROM membership_companions mc
            JOIN members m2 ON m2.id = mc.companion_member_id
            WHERE mc.membership_id = ms.id
          )
          ELSE NULL
        END AS companion_names
      FROM members m
      LEFT JOIN LATERAL (
        SELECT id, start_date, end_date, price_cents
        FROM memberships
        WHERE member_id = m.id
        ORDER BY end_date DESC, id DESC
        LIMIT 1
      ) ms ON TRUE
      WHERE EXISTS (SELECT 1 FROM memberships WHERE member_id = m.id)
         OR EXISTS (SELECT 1 FROM payments WHERE member_id = m.id AND notes = 'Pago por visita')
         OR (
           NOT EXISTS (SELECT 1 FROM memberships WHERE member_id = m.id)
           AND m.price_cents > 0
         )
      ORDER BY member_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el resumen de asistencia." });
  }
});

app.get("/api/members/:id/attendance-history", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  try {
    const memberResult = await pool.query("SELECT * FROM members WHERE id=$1", [id]);
    const member = memberResult.rows[0];
    if (!member) return res.status(404).json({ error: "Usuario no encontrado." });

    const [memberships, dayPayments] = await Promise.all([
      pool.query(
        `
        SELECT
          ms.id,
          ms.start_date,
          ms.end_date,
          ms.price_cents,
          ms.status,
          pl.name AS plan_name,
          COALESCE(ms_pay.method, ms.payment_method, 'cash') AS pay_method,
          (SELECT COUNT(*)::int FROM membership_companions mc WHERE mc.membership_id = ms.id) AS companion_count,
          (
            SELECT string_agg(m2.first_name || ' ' || m2.last_name, ', ' ORDER BY mc.id)
            FROM membership_companions mc
            JOIN members m2 ON m2.id = mc.companion_member_id
            WHERE mc.membership_id = ms.id
          ) AS companion_names
        FROM memberships ms
        JOIN plans pl ON pl.id = ms.plan_id
        LEFT JOIN LATERAL (
          SELECT method
          FROM payments
          WHERE membership_id = ms.id
          ORDER BY id DESC
          LIMIT 1
        ) ms_pay ON TRUE
        WHERE ms.member_id = $1
        ORDER BY ms.start_date ASC, ms.id ASC
      `,
        [id]
      ),
      pool.query(
        `
        SELECT id, payment_date, amount_cents, method
        FROM payments
        WHERE member_id = $1 AND notes = 'Pago por visita'
        ORDER BY payment_date ASC, id ASC
      `,
        [id]
      ),
    ]);

    type HistRow = {
      kind: "membership" | "day_visit";
      start_date: string;
      end_date: string | null;
      price_cents: number;
      method: string;
      label: string;
      companion_count?: number;
      companion_names?: string | null;
    };

    const events: HistRow[] = [];

    for (const ms of memberships.rows) {
      events.push({
        kind: "membership",
        start_date: ms.start_date,
        end_date: ms.end_date,
        price_cents: ms.price_cents,
        method: ms.pay_method ?? ms.payment_method ?? "cash",
        label: ms.plan_name ?? "Membresía mensual",
        companion_count: Number(ms.companion_count ?? 0),
        companion_names: ms.companion_names ?? null,
      });
    }

    for (const p of dayPayments.rows) {
      events.push({
        kind: "day_visit",
        start_date: p.payment_date,
        end_date: null,
        price_cents: p.amount_cents,
        method: p.method,
        label: "Pago por día",
      });
    }

    if (memberships.rows.length === 0 && dayPayments.rows.length === 0 && member.price_cents > 0) {
      events.push({
        kind: "day_visit",
        start_date: member.joined_on,
        end_date: null,
        price_cents: member.price_cents,
        method: member.payment_method,
        label: "Pago por día (registro)",
      });
    }

    events.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

    res.json({
      member_id: member.id,
      member_name: `${member.first_name} ${member.last_name}`.trim(),
      events,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el historial." });
  }
});

app.get("/api/attendance", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, m.first_name || ' ' || m.last_name AS member_name
      FROM attendance a JOIN members m ON m.id=a.member_id
      ORDER BY a.checkin_at DESC LIMIT 200
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo consultar la asistencia." });
  }
});

app.post("/api/attendance", async (req, res) => {
  const memberId = Number(req.body?.member_id);
  if (!Number.isSafeInteger(memberId) || memberId < 1) return res.status(400).json({ error: "Selecciona un socio activo." });
  const visitDate = typeof req.body?.visit_date === "string" ? req.body.visit_date : today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return res.status(400).json({ error: "Fecha inválida." });
  try {
    const member = await pool.query("SELECT id FROM members WHERE id=$1 AND status='active'", [memberId]);
    if (!member.rowCount) return res.status(400).json({ error: "Selecciona un socio activo." });
    const result = await pool.query(
      `
      INSERT INTO attendance (member_id, visit_date, checkin_at)
      VALUES ($1, $2, ($2::date + TIME '12:00') AT TIME ZONE 'UTC')
      ON CONFLICT (member_id, visit_date) DO UPDATE SET checkin_at = EXCLUDED.checkin_at
      RETURNING *
    `,
      [memberId, visitDate]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar la asistencia." });
  }
});

app.get("/api/members/:id/attendance-calendar", async (req, res) => {
  const id = Number(req.params.id);
  const monthRaw = typeof req.query.month === "string" ? req.query.month : today().slice(0, 7);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  if (!/^\d{4}-\d{2}$/.test(monthRaw)) return res.status(400).json({ error: "Mes inválido (use YYYY-MM)." });
  const [y, m] = monthRaw.split("-").map(Number);
  if (m < 1 || m > 12) return res.status(400).json({ error: "Mes inválido." });
  const { start, endExclusive } = monthRange(monthRaw);
  try {
    const member = await pool.query(
      "SELECT id, first_name, last_name FROM members WHERE id=$1",
      [id]
    );
    if (!member.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    const [{ dates: eligible_dates, coverage }, visits, workouts_by_date] = await Promise.all([
      eligibleAttendanceDates(id, monthRaw),
      pool.query(
        `
        SELECT visit_date::text AS visit_date
        FROM attendance
        WHERE member_id = $1
          AND visit_date >= $2::date
          AND visit_date < $3::date
        ORDER BY visit_date
      `,
        [id, start, endExclusive]
      ),
      workoutsByDateForRange(id, start, endExclusive),
    ]);
    const names = member.rows[0];
    res.json({
      member_id: names.id,
      member_name: `${names.first_name} ${names.last_name}`.trim(),
      year_month: monthRaw,
      visited_dates: visits.rows.map((r) => String(r.visit_date).slice(0, 10)),
      visit_count: visits.rowCount ?? 0,
      eligible_dates,
      coverage,
      workouts_by_date,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el calendario." });
  }
});

app.get("/api/attendance/today-workouts", async (_req, res) => {
  const day = today();
  try {
    const result = await pool.query(
      `
      SELECT
        m.id AS member_id,
        TRIM(m.first_name || ' ' || m.last_name) AS member_name,
        COALESCE(
          array_agg(ve.exercise_key ORDER BY ve.exercise_key)
            FILTER (WHERE ve.exercise_key IS NOT NULL),
          ARRAY[]::text[]
        ) AS exercises
      FROM attendance a
      JOIN members m ON m.id = a.member_id
      LEFT JOIN visit_exercises ve
        ON ve.member_id = a.member_id AND ve.visit_date = a.visit_date
      WHERE a.visit_date = $1::date
      GROUP BY m.id, m.first_name, m.last_name
      ORDER BY m.last_name, m.first_name
    `,
      [day]
    );
    res.json({
      date: day,
      rows: result.rows.map((row) => ({
        member_id: Number(row.member_id),
        member_name: String(row.member_name),
        exercises: Array.isArray(row.exercises)
          ? row.exercises.map(String)
          : String(row.exercises ?? "")
              .replace(/^\{|\}$/g, "")
              .split(",")
              .filter(Boolean),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar las rutinas de hoy." });
  }
});

app.get("/api/members/:id/visit-exercises", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  const dateRaw = typeof req.query.date === "string" ? req.query.date : "";
  const monthRaw = typeof req.query.month === "string" ? req.query.month : "";
  try {
    const member = await pool.query("SELECT id FROM members WHERE id=$1", [id]);
    if (!member.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    if (dateRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        return res.status(400).json({ error: "Fecha inválida." });
      }
      const attended = await pool.query(
        `SELECT 1 FROM attendance WHERE member_id=$1 AND visit_date=$2::date`,
        [id, dateRaw]
      );
      if (!attended.rowCount) {
        return res.json({ date: dateRaw, attended: false, exercises: [] });
      }
      const ex = await pool.query(
        `
        SELECT exercise_key FROM visit_exercises
        WHERE member_id=$1 AND visit_date=$2::date
        ORDER BY exercise_key
      `,
        [id, dateRaw]
      );
      return res.json({
        date: dateRaw,
        attended: true,
        exercises: ex.rows.map((r) => String(r.exercise_key)),
      });
    }
    if (monthRaw) {
      if (!/^\d{4}-\d{2}$/.test(monthRaw)) {
        return res.status(400).json({ error: "Mes inválido (use YYYY-MM)." });
      }
      const { start, endExclusive } = monthRange(monthRaw);
      const by_date = await workoutsByDateForRange(id, start, endExclusive);
      return res.json({ year_month: monthRaw, by_date });
    }
    return res.status(400).json({ error: "Indica ?date=YYYY-MM-DD o ?month=YYYY-MM." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron consultar los ejercicios." });
  }
});

app.put("/api/members/:id/visit-exercises", async (req, res) => {
  const id = Number(req.params.id);
  const visitDate = typeof req.body?.date === "string" ? req.body.date : "";
  const parsed = parseExerciseKeys(req.body?.exercises);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return res.status(400).json({ error: "Fecha inválida." });
  if (!parsed.ok) return res.status(400).json({ error: "Lista de ejercicios inválida." });
  if (visitDate > today()) {
    return res.status(400).json({ error: "No puedes registrar rutina en días futuros." });
  }
  const client = await pool.connect();
  try {
    const member = await client.query("SELECT id FROM members WHERE id=$1", [id]);
    if (!member.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    const attended = await client.query(
      `SELECT 1 FROM attendance WHERE member_id=$1 AND visit_date=$2::date`,
      [id, visitDate]
    );
    if (!attended.rowCount) {
      return res.status(400).json({
        error: "Primero marca la asistencia de ese día (calendario de actividad).",
      });
    }
    await client.query("BEGIN");
    await client.query(`DELETE FROM visit_exercises WHERE member_id=$1 AND visit_date=$2::date`, [
      id,
      visitDate,
    ]);
    for (const key of parsed.keys) {
      await client.query(
        `
        INSERT INTO visit_exercises (member_id, visit_date, exercise_key)
        VALUES ($1, $2::date, $3)
      `,
        [id, visitDate, key]
      );
    }
    await client.query("COMMIT");
    res.json({ date: visitDate, exercises: parsed.keys });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "No se pudo guardar la rutina." });
  } finally {
    client.release();
  }
});

/** Marcar o quitar asistencia manual por día (plantilla hasta lector de huellas). */
app.put("/api/members/:id/attendance-day", async (req, res) => {
  const id = Number(req.params.id);
  const visitDate = typeof req.body?.date === "string" ? req.body.date : "";
  const visited = req.body?.visited === true;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID inválido." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return res.status(400).json({ error: "Fecha inválida." });
  if (visitDate > today()) return res.status(400).json({ error: "No puedes marcar días futuros." });
  try {
    const member = await pool.query("SELECT id FROM members WHERE id=$1", [id]);
    if (!member.rowCount) return res.status(404).json({ error: "Usuario no encontrado." });
    if (visited) {
      if (!isGymOpenOnDate(visitDate)) {
        return res.status(400).json({ error: "El gimnasio no abre ese día (domingo)." });
      }
      const ok = await isAttendanceDateEligible(id, visitDate);
      if (!ok) {
        return res.status(400).json({
          error:
            "Ese día no está dentro de la membresía vigente ni de un pago por visita registrado.",
        });
      }
      const ins = await pool.query(
        `
        INSERT INTO attendance (member_id, visit_date, checkin_at)
        VALUES ($1, $2, ($2::date + TIME '12:00') AT TIME ZONE 'UTC')
        ON CONFLICT (member_id, visit_date) DO UPDATE SET checkin_at = EXCLUDED.checkin_at
        RETURNING *
      `,
        [id, visitDate]
      );
      return res.json({ visited: true, record: ins.rows[0] });
    }
    await pool.query(`DELETE FROM attendance WHERE member_id=$1 AND visit_date=$2::date`, [
      id,
      visitDate,
    ]);
    res.json({ visited: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el día." });
  }
});

async function start() {
  try {
    await initDb();
    await pool.query("SELECT 1");
    app.listen(port, "127.0.0.1", () => {
      console.log(`GymAdmin API lista en http://127.0.0.1:${port}`);
      console.log(`Base de datos: ${process.env.PGDATABASE ?? "gymadmin"} en ${process.env.PGHOST ?? "127.0.0.1"}:${process.env.PGPORT ?? 5432}`);
    });
  } catch (error) {
    console.error("No se pudo iniciar GymAdmin. Revisa server/.env y que PostgreSQL esté iniciado.", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => { await pool.end(); process.exit(0); });
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
void start();

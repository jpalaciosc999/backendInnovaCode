import jwt from "jsonwebtoken";
import { executeQuery } from "../../config/db.js";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() || null : value ?? null;
}

function toNumberOrNull(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizeTipoGasto(value) {
  return String(value || "").trim().toUpperCase();
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "").trim();
}

function getAuthUser(req) {
  if (req.user) return req.user;
  if (req.usuario) return req.usuario;

  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function getAuthEmpId(req) {
  const user = getAuthUser(req);
  return toNumberOrNull(user?.emp_id ?? user?.EMP_ID);
}

function getAuthRole(req) {
  const user = getAuthUser(req);

  return String(
    user?.rol_nombre ||
    user?.ROL_NOMBRE ||
    user?.rol ||
    ""
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

function isAdminOrContabilidad(req) {
  const role = getAuthRole(req);

  return (
    role === "ADMINISTRADORNOMINA" ||
    role === "CONTABILIDAD"
  );
}

function requireAuthenticated(req) {
  const user = getAuthUser(req);

  if (!user) {
    throw new HttpError(401, "Token requerido o inválido");
  }

  return user;
}

async function ensureEmpleadoExists(empId) {
  const result = await executeQuery(
    `
      SELECT EMP_ID
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  if (result.rows.length === 0) {
    throw new HttpError(400, "El empleado indicado no existe");
  }
}

async function ensurePagoExists(id) {
  const result = await executeQuery(
    `
      SELECT
        MIT_ID,
        EMP_ID,
        NOM_ID,
        TDS_ID,
        MIT_TIPO_GASTO,
        MIT_MONTO,
        TO_CHAR(MIT_FECHA, 'YYYY-MM-DD') AS MIT_FECHA,
        MIT_DESCRIPCION,
        MIT_ESTADO,
        TO_CHAR(MIT_FECHA_CREACION, 'YYYY-MM-DD') AS MIT_FECHA_CREACION,
        TO_CHAR(MIT_MODIFICACION, 'YYYY-MM-DD') AS MIT_MODIFICACION
      FROM EMP_MI_TIENDITA
      WHERE MIT_ID = :id
    `,
    { id: Number(id) }
  );

  if (result.rows.length === 0) {
    throw new HttpError(404, "Registro de Mi Tiendita no encontrado");
  }

  return result.rows[0];
}

function validarPayload(body) {
  const tipoGasto = normalizeTipoGasto(body.tipo_gasto ?? body.mit_tipo_gasto);
  const monto = Number(body.monto ?? body.mit_monto);
  const fecha = String(body.fecha ?? body.mit_fecha ?? "").trim();
  const descripcion = normalizeOptionalText(body.descripcion ?? body.mit_descripcion);
  const tdsId = toNumberOrNull(body.tds_id ?? body.TDS_ID);

  if (!["SEGURO", "PARQUEO", "TIENDA"].includes(tipoGasto)) {
    throw new HttpError(400, "El tipo de gasto debe ser SEGURO, PARQUEO o TIENDA");
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new HttpError(400, "El monto debe ser mayor a 0");
  }

  if (!fecha || !isValidDate(fecha)) {
    throw new HttpError(400, "La fecha debe tener formato YYYY-MM-DD");
  }

  return {
    tipo_gasto: tipoGasto,
    monto,
    fecha,
    descripcion,
    tds_id: tdsId
  };
}

/* =======================
   OBTENER TODOS
   Admin / Contabilidad
======================= */
export async function getPagosMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    if (!isAdminOrContabilidad(req)) {
      return res.status(403).json({
        message: "No tienes permisos para consultar todos los registros"
      });
    }

    const sql = `
      SELECT
        m.MIT_ID,
        m.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        m.NOM_ID,
        m.TDS_ID,
        m.MIT_TIPO_GASTO,
        m.MIT_MONTO,
        TO_CHAR(m.MIT_FECHA, 'YYYY-MM-DD') AS MIT_FECHA,
        m.MIT_DESCRIPCION,
        m.MIT_ESTADO,
        TO_CHAR(m.MIT_FECHA_CREACION, 'YYYY-MM-DD') AS MIT_FECHA_CREACION,
        TO_CHAR(m.MIT_MODIFICACION, 'YYYY-MM-DD') AS MIT_MODIFICACION
      FROM EMP_MI_TIENDITA m
      INNER JOIN EMP_EMPLEADO e ON e.EMP_ID = m.EMP_ID
      ORDER BY m.MIT_FECHA DESC, m.MIT_ID DESC
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error obteniendo registros de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   OBTENER MIS PAGOS
   Empleado logueado
======================= */
export async function getMisPagosMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    const empId = getAuthEmpId(req);

    if (!empId) {
      return res.status(400).json({
        message: "Tu usuario no tiene un empleado asociado"
      });
    }

    const sql = `
      SELECT
        MIT_ID,
        EMP_ID,
        NOM_ID,
        TDS_ID,
        MIT_TIPO_GASTO,
        MIT_MONTO,
        TO_CHAR(MIT_FECHA, 'YYYY-MM-DD') AS MIT_FECHA,
        MIT_DESCRIPCION,
        MIT_ESTADO,
        TO_CHAR(MIT_FECHA_CREACION, 'YYYY-MM-DD') AS MIT_FECHA_CREACION,
        TO_CHAR(MIT_MODIFICACION, 'YYYY-MM-DD') AS MIT_MODIFICACION
      FROM EMP_MI_TIENDITA
      WHERE EMP_ID = :emp_id
      ORDER BY MIT_FECHA DESC, MIT_ID DESC
    `;

    const result = await executeQuery(sql, { emp_id: empId });
    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error obteniendo tus registros de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPagoMiTienditaById(req, res) {
  try {
    requireAuthenticated(req);

    const { id } = req.params;
    const pago = await ensurePagoExists(id);

    const empId = getAuthEmpId(req);

    if (!isAdminOrContabilidad(req) && Number(pago.EMP_ID) !== Number(empId)) {
      return res.status(403).json({
        message: "No tienes permisos para consultar este registro"
      });
    }

    res.json(pago);
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error obteniendo registro de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   CREAR GASTO
======================= */
export async function createPagoMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    const payload = validarPayload(req.body);

    let empId = getAuthEmpId(req);

    if (isAdminOrContabilidad(req) && req.body.emp_id) {
      empId = Number(req.body.emp_id);
    }

    if (!empId) {
      return res.status(400).json({
        message: "Tu usuario no tiene un empleado asociado"
      });
    }

    await ensureEmpleadoExists(empId);

    const sql = `
      INSERT INTO EMP_MI_TIENDITA (
        MIT_ID,
        EMP_ID,
        NOM_ID,
        TDS_ID,
        MIT_TIPO_GASTO,
        MIT_MONTO,
        MIT_FECHA,
        MIT_DESCRIPCION,
        MIT_ESTADO,
        MIT_FECHA_CREACION
      )
      VALUES (
        SEQ_EMP_MI_TIENDITA.NEXTVAL,
        :emp_id,
        NULL,
        :tds_id,
        :tipo_gasto,
        :monto,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        :descripcion,
        'PENDIENTE',
        SYSDATE
      )
    `;

    await executeQuery(sql, {
      emp_id: empId,
      tds_id: payload.tds_id,
      tipo_gasto: payload.tipo_gasto,
      monto: payload.monto,
      fecha: payload.fecha,
      descripcion: payload.descripcion
    });

    res.status(201).json({
      message: "Gasto de Mi Tiendita creado correctamente"
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error creando gasto de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR GASTO
   Solo si está PENDIENTE
======================= */
export async function updatePagoMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    const { id } = req.params;
    const pago = await ensurePagoExists(id);

    const empId = getAuthEmpId(req);

    if (!isAdminOrContabilidad(req) && Number(pago.EMP_ID) !== Number(empId)) {
      return res.status(403).json({
        message: "No tienes permisos para actualizar este registro"
      });
    }

    if (pago.MIT_ESTADO !== "PENDIENTE") {
      return res.status(409).json({
        message: "Solo se pueden actualizar gastos pendientes"
      });
    }

    const payload = validarPayload(req.body);

    const sql = `
      UPDATE EMP_MI_TIENDITA
      SET
        TDS_ID = :tds_id,
        MIT_TIPO_GASTO = :tipo_gasto,
        MIT_MONTO = :monto,
        MIT_FECHA = TO_DATE(:fecha, 'YYYY-MM-DD'),
        MIT_DESCRIPCION = :descripcion,
        MIT_MODIFICACION = SYSDATE
      WHERE MIT_ID = :id
        AND MIT_ESTADO = 'PENDIENTE'
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      tds_id: payload.tds_id,
      tipo_gasto: payload.tipo_gasto,
      monto: payload.monto,
      fecha: payload.fecha,
      descripcion: payload.descripcion
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Registro de Mi Tiendita no encontrado o ya no está pendiente"
      });
    }

    res.json({
      message: "Gasto de Mi Tiendita actualizado correctamente"
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error actualizando gasto de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR GASTO
   Solo si está PENDIENTE
======================= */
export async function deletePagoMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    const { id } = req.params;
    const pago = await ensurePagoExists(id);

    const empId = getAuthEmpId(req);

    if (!isAdminOrContabilidad(req) && Number(pago.EMP_ID) !== Number(empId)) {
      return res.status(403).json({
        message: "No tienes permisos para eliminar este registro"
      });
    }

    if (pago.MIT_ESTADO !== "PENDIENTE") {
      return res.status(409).json({
        message: "Solo se pueden eliminar gastos pendientes"
      });
    }

    const sql = `
      DELETE FROM EMP_MI_TIENDITA
      WHERE MIT_ID = :id
        AND MIT_ESTADO = 'PENDIENTE'
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Registro de Mi Tiendita no encontrado o ya no está pendiente"
      });
    }

    res.json({
      message: "Gasto de Mi Tiendita eliminado correctamente"
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error eliminando gasto de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   ANULAR GASTO
   Recomendado para auditoría
======================= */
export async function anularPagoMiTiendita(req, res) {
  try {
    requireAuthenticated(req);

    const { id } = req.params;
    const pago = await ensurePagoExists(id);

    const empId = getAuthEmpId(req);

    if (!isAdminOrContabilidad(req) && Number(pago.EMP_ID) !== Number(empId)) {
      return res.status(403).json({
        message: "No tienes permisos para anular este registro"
      });
    }

    if (pago.MIT_ESTADO !== "PENDIENTE") {
      return res.status(409).json({
        message: "Solo se pueden anular gastos pendientes"
      });
    }

    const sql = `
      UPDATE EMP_MI_TIENDITA
      SET
        MIT_ESTADO = 'ANULADO',
        MIT_MODIFICACION = SYSDATE
      WHERE MIT_ID = :id
        AND MIT_ESTADO = 'PENDIENTE'
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Registro de Mi Tiendita no encontrado o ya no está pendiente"
      });
    }

    res.json({
      message: "Gasto de Mi Tiendita anulado correctamente"
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error anulando gasto de Mi Tiendita",
      error: error.message
    });
  }
}

/* =======================
   TOTAL PENDIENTE POR EMPLEADO
   Útil para nómina
======================= */
export async function getTotalPendientePorEmpleado(req, res) {
  try {
    requireAuthenticated(req);

    if (!isAdminOrContabilidad(req)) {
      return res.status(403).json({
        message: "No tienes permisos para consultar totales pendientes"
      });
    }

    const sql = `
      SELECT
        EMP_ID,
        SUM(MIT_MONTO) AS TOTAL_MI_TIENDITA
      FROM EMP_MI_TIENDITA
      WHERE MIT_ESTADO = 'PENDIENTE'
      GROUP BY EMP_ID
      ORDER BY EMP_ID
    `;

    const result = await executeQuery(sql);

    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error obteniendo total pendiente de Mi Tiendita",
      error: error.message
    });
  }
}
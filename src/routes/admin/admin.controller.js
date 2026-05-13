import { executeQuery } from "../../config/db.js";

function normalizeDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInteger(value, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    return null;
  }

  return numberValue;
}

function hasQueryValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export async function getAdminResumen(req, res) {
  try {
    const [usuarios, empleados, nominas, seguridad, actividad] = await Promise.all([
      executeQuery(`
        SELECT
          COUNT(*) AS TOTAL_USUARIOS,
          SUM(CASE WHEN NVL(USU_ESTADO, 'A') = 'A' THEN 1 ELSE 0 END) AS USUARIOS_ACTIVOS,
          SUM(CASE WHEN NVL(USU_ESTADO, 'A') = 'I' THEN 1 ELSE 0 END) AS USUARIOS_INACTIVOS
        FROM EMP_USUARIO
      `),
      executeQuery(`
        SELECT
          COUNT(*) AS TOTAL_EMPLEADOS,
          SUM(CASE WHEN NVL(EMP_ESTADO, 'A') = 'A' THEN 1 ELSE 0 END) AS EMPLEADOS_ACTIVOS,
          SUM(CASE WHEN NVL(EMP_ESTADO, 'A') = 'I' THEN 1 ELSE 0 END) AS EMPLEADOS_INACTIVOS
        FROM EMP_EMPLEADO
      `),
      executeQuery(`
        SELECT
          COUNT(*) AS TOTAL_NOMINAS,
          NVL(SUM(NOM_TOTAL_INGRESOS), 0) AS TOTAL_INGRESOS,
          NVL(SUM(NOM_TOTAL_DESCUENTO), 0) AS TOTAL_DESCUENTOS,
          NVL(SUM(NOM_SALARIO_LIQUIDO), 0) AS TOTAL_NETO,
          SUM(CASE WHEN NVL(NOM_ESTADO, 'A') = 'A' THEN 1 ELSE 0 END) AS NOMINAS_ACTIVAS,
          SUM(CASE WHEN NVL(NOM_ESTADO, 'A') IN ('P', 'PAGADA') THEN 1 ELSE 0 END) AS NOMINAS_PAGADAS
        FROM EMP_NOMINA
      `),
      executeQuery(`
        SELECT
          (SELECT COUNT(*) FROM EMP_ROLES) AS TOTAL_ROLES,
          (SELECT COUNT(*) FROM EMP_PERMISOS) AS TOTAL_PERMISOS,
          (SELECT COUNT(*) FROM EMP_ROL_PERMISOS) AS TOTAL_ASIGNACIONES
        FROM DUAL
      `),
      executeQuery(`
        SELECT *
        FROM (
          SELECT
            b.BIT_ID,
            b.BIT_ACCION,
            b.BIT_TABLA_AFECTADA,
            b.BIT_ID_REGISTRO,
            DBMS_LOB.SUBSTR(b.BIT_DESCRIPCION, 1000, 1) AS BIT_DESCRIPCION,
            b.BIT_IP_USUARIO,
            b.BIT_FECHA,
            u.USU_ID,
            u.USU_USERNAME,
            u.USU_NOMBRE_COMPLETO
          FROM EMP_BITACORA b
          LEFT JOIN EMP_USUARIO_BITACORA ub ON ub.BIT_ID = b.BIT_ID
          LEFT JOIN EMP_USUARIO u ON u.USU_ID = ub.USU_ID
          ORDER BY b.BIT_FECHA DESC, b.BIT_ID DESC
        )
        WHERE ROWNUM <= 8
      `)
    ]);

    res.json({
      usuarios: usuarios.rows[0],
      empleados: empleados.rows[0],
      nominas: nominas.rows[0],
      seguridad: seguridad.rows[0],
      actividad_reciente: actividad.rows
    });
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo resumen administrativo",
      error: error.message
    });
  }
}

export async function getAdminActividad(req, res) {
  try {
    const accion = normalizeText(req.query.accion).toUpperCase();
    const tabla = normalizeText(req.query.tabla).toUpperCase();
    const fechaDesde = normalizeDate(req.query.fecha_desde);
    const fechaHasta = normalizeDate(req.query.fecha_hasta);
    const usuarioId = normalizeInteger(req.query.usuario_id, null, { min: 1 });
    const limit = normalizeInteger(req.query.limit, 100, { min: 1, max: 200 });
    const offset = normalizeInteger(req.query.offset, 0, { min: 0, max: 100000 });
    const binds = {};
    const conditions = [];

    if ((hasQueryValue(req.query.fecha_desde) && !fechaDesde) ||
        (hasQueryValue(req.query.fecha_hasta) && !fechaHasta)) {
      return res.status(400).json({
        message: "Las fechas deben tener formato YYYY-MM-DD"
      });
    }

    if (hasQueryValue(req.query.usuario_id) && !usuarioId) {
      return res.status(400).json({
        message: "El usuario_id debe ser numerico"
      });
    }

    if (limit === null || offset === null) {
      return res.status(400).json({
        message: "Los parametros limit y offset deben ser numericos y validos"
      });
    }

    if (accion) {
      conditions.push("UPPER(b.BIT_ACCION) = :accion");
      binds.accion = accion;
    }

    if (tabla) {
      conditions.push("UPPER(b.BIT_TABLA_AFECTADA) = :tabla");
      binds.tabla = tabla;
    }

    if (fechaDesde) {
      conditions.push("b.BIT_FECHA >= TO_DATE(:fecha_desde, 'YYYY-MM-DD')");
      binds.fecha_desde = fechaDesde;
    }

    if (fechaHasta) {
      conditions.push("b.BIT_FECHA < TO_DATE(:fecha_hasta, 'YYYY-MM-DD') + 1");
      binds.fecha_hasta = fechaHasta;
    }

    if (usuarioId) {
      conditions.push("u.USU_ID = :usuario_id");
      binds.usuario_id = usuarioId;
    }

    binds.limit = limit;
    binds.offset = offset;

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await executeQuery(
      `
        SELECT
          b.BIT_ID,
          b.BIT_ACCION,
          b.BIT_TABLA_AFECTADA,
          b.BIT_ID_REGISTRO,
          DBMS_LOB.SUBSTR(b.BIT_DESCRIPCION, 4000, 1) AS BIT_DESCRIPCION,
          DBMS_LOB.SUBSTR(b.BIT_VALOR_ANTERIOR, 4000, 1) AS BIT_VALOR_ANTERIOR,
          DBMS_LOB.SUBSTR(b.BIT_VALOR_NUEVO, 4000, 1) AS BIT_VALOR_NUEVO,
          b.BIT_IP_USUARIO,
          b.BIT_FECHA,
          u.USU_ID,
          u.USU_USERNAME,
          u.USU_NOMBRE_COMPLETO
        FROM EMP_BITACORA b
        LEFT JOIN EMP_USUARIO_BITACORA ub ON ub.BIT_ID = b.BIT_ID
        LEFT JOIN EMP_USUARIO u ON u.USU_ID = ub.USU_ID
        ${where}
        ORDER BY b.BIT_FECHA DESC, b.BIT_ID DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `,
      binds
    );

    res.json({
      data: result.rows,
      pagination: {
        limit,
        offset,
        count: result.rows.length
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo actividad administrativa",
      error: error.message
    });
  }
}

export async function getAdminCatalogo(req, res) {
  try {
    const [roles, permisos, usuarios] = await Promise.all([
      executeQuery(`
        SELECT
          r.ROL_ID,
          r.ROL_NOMBRE,
          r.ROL_DESCRIPCION,
          r.ROL_NIVEL_ACCESO,
          r.ROL_ESTADO,
          COUNT(DISTINCT u.USU_ID) AS TOTAL_USUARIOS,
          COUNT(DISTINCT rp.PER_ID) AS TOTAL_PERMISOS
        FROM EMP_ROLES r
        LEFT JOIN EMP_USUARIO u ON u.ROL_ID = r.ROL_ID
        LEFT JOIN EMP_ROL_PERMISOS rp ON rp.ROL_ID = r.ROL_ID
        GROUP BY
          r.ROL_ID,
          r.ROL_NOMBRE,
          r.ROL_DESCRIPCION,
          r.ROL_NIVEL_ACCESO,
          r.ROL_ESTADO
        ORDER BY r.ROL_NIVEL_ACCESO, r.ROL_NOMBRE
      `),
      executeQuery(`
        SELECT
          PER_MODULO,
          COUNT(*) AS TOTAL_PERMISOS
        FROM EMP_PERMISOS
        GROUP BY PER_MODULO
        ORDER BY PER_MODULO
      `),
      executeQuery(`
        SELECT
          u.USU_ID,
          u.USU_USERNAME,
          u.USU_NOMBRE_COMPLETO,
          u.USU_CORREO,
          u.USU_ESTADO,
          r.ROL_NOMBRE,
          e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO
        FROM EMP_USUARIO u
        LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
        LEFT JOIN EMP_EMPLEADO e ON e.EMP_ID = u.EMP_ID
        ORDER BY u.USU_ESTADO, u.USU_NOMBRE_COMPLETO
      `)
    ]);

    res.json({
      roles: roles.rows,
      permisos_por_modulo: permisos.rows,
      usuarios: usuarios.rows
    });
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo catalogo administrativo",
      error: error.message
    });
  }
}

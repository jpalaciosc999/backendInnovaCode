import { executeQuery, executeTransaction } from "../../config/db.js";
import { registrarBitacora } from "../../utils/auditoria.js";
import { canManageRoleLevel, isCurrentRole } from "../../utils/adminAccess.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeEstado(value) {
  const estado = typeof value === "string" ? value.trim().toUpperCase() : value;
  return estado || "A";
}

function isDateValue(value) {
  return value === null || value === undefined || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getParamId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

async function existeRolNombre(nombre, rolId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_ROLES
      WHERE LOWER(ROL_NOMBRE) = LOWER(:nombre)
        AND (:rol_id IS NULL OR ROL_ID <> :rol_id)
    `,
    { nombre, rol_id: rolId }
  );

  return result.rows.length > 0;
}

async function validarRol(payload, rolId = null) {
  if (!payload.rol_nombre) {
    return "El nombre del rol es obligatorio";
  }

  if (!["A", "I"].includes(payload.rol_estado)) {
    return "El estado del rol debe ser A o I";
  }

  if (!Number.isFinite(Number(payload.rol_nivel_acceso))) {
    return "El nivel de acceso debe ser numerico";
  }

  if (!isDateValue(payload.rol_fecha_creacion)) {
    return "La fecha de creacion debe tener formato YYYY-MM-DD";
  }

  if (await existeRolNombre(payload.rol_nombre, rolId)) {
    return "Ya existe un rol con ese nombre";
  }

  return null;
}

async function getRolSnapshot(rolId) {
  const result = await executeQuery(
    `
      SELECT
        ROL_ID,
        ROL_NOMBRE,
        ROL_DESCRIPCION,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      FROM EMP_ROLES
      WHERE ROL_ID = :id
    `,
    { id: rolId }
  );

  return result.rows[0] || null;
}

async function countUsuariosActivosRol(rolId) {
  const result = await executeQuery(
    `
      SELECT COUNT(*) AS TOTAL
      FROM EMP_USUARIO
      WHERE ROL_ID = :id
        AND NVL(USU_ESTADO, 'A') = 'A'
    `,
    { id: rolId }
  );

  return Number(result.rows[0]?.TOTAL || 0);
}

export async function getRoles(req, res) {
  try {
    const sql = `
      SELECT
        r.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_DESCRIPCION,
        r.ROL_NIVEL_ACCESO,
        r.ROL_ESTADO,
        r.ROL_FECHA_CREACION,
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
        r.ROL_ESTADO,
        r.ROL_FECHA_CREACION
      ORDER BY r.ROL_NIVEL_ACCESO, r.ROL_NOMBRE
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo roles",
      error: error.message
    });
  }
}

export async function getRolById(req, res) {
  try {
    const { id } = req.params;
    const rolId = getParamId(id);

    if (!rolId) {
      return res.status(400).json({ message: "El id del rol debe ser numerico" });
    }

    const sql = `
      SELECT
        r.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_DESCRIPCION,
        r.ROL_NIVEL_ACCESO,
        r.ROL_ESTADO,
        r.ROL_FECHA_CREACION,
        COUNT(DISTINCT u.USU_ID) AS TOTAL_USUARIOS,
        COUNT(DISTINCT rp.PER_ID) AS TOTAL_PERMISOS
      FROM EMP_ROLES r
      LEFT JOIN EMP_USUARIO u ON u.ROL_ID = r.ROL_ID
      LEFT JOIN EMP_ROL_PERMISOS rp ON rp.ROL_ID = r.ROL_ID
      WHERE r.ROL_ID = :id
      GROUP BY
        r.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_DESCRIPCION,
        r.ROL_NIVEL_ACCESO,
        r.ROL_ESTADO,
        r.ROL_FECHA_CREACION
    `;

    const result = await executeQuery(sql, { id: rolId });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo rol",
      error: error.message
    });
  }
}

export async function createRol(req, res) {
  try {
    const {
      rol_nombre,
      rol_descripcion,
      rol_nivel_acceso,
      rol_estado,
      rol_fecha_creacion
    } = req.body;
    const payload = {
      rol_nombre: normalizeString(rol_nombre),
      rol_descripcion: normalizeString(rol_descripcion) || null,
      rol_nivel_acceso: Number(rol_nivel_acceso),
      rol_estado: normalizeEstado(rol_estado),
      rol_fecha_creacion: rol_fecha_creacion || null
    };

    const validationError = await validarRol(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (!canManageRoleLevel(req, payload.rol_nivel_acceso)) {
      return res.status(403).json({
        message: "No puede crear roles de nivel igual o superior al suyo"
      });
    }

    const sql = `
      INSERT INTO EMP_ROLES (
        ROL_ID,
        ROL_NOMBRE,
        ROL_DESCRIPCION,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      )
      VALUES (
        EMP_ROLES_SEQ.NEXTVAL,
        :rol_nombre,
        :rol_descripcion,
        :rol_nivel_acceso,
        :rol_estado,
        NVL(TO_DATE(:rol_fecha_creacion, 'YYYY-MM-DD'), SYSDATE)
      )
    `;

    await executeTransaction(async ({ execute }) => {
      await execute(sql, payload);

      await registrarBitacora(req, {
        accion: "CREATE",
        tabla: "EMP_ROLES",
        descripcion: `Rol creado: ${payload.rol_nombre}`,
        valorNuevo: payload
      }, execute);
    });

    res.status(201).json({ message: "Rol creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando rol",
      error: error.message
    });
  }
}

export async function updateRol(req, res) {
  try {
    const { id } = req.params;
    const rolId = getParamId(id);

    if (!rolId) {
      return res.status(400).json({ message: "El id del rol debe ser numerico" });
    }

    const rolAnterior = await getRolSnapshot(rolId);

    if (!rolAnterior) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    if (isCurrentRole(req, rolId)) {
      return res.status(403).json({
        message: "No puede modificar el rol con el que esta autenticado"
      });
    }

    const {
      rol_nombre,
      rol_descripcion,
      rol_nivel_acceso,
      rol_estado,
      rol_fecha_creacion
    } = req.body;
    const payload = {
      id: rolId,
      rol_nombre: normalizeString(rol_nombre),
      rol_descripcion: normalizeString(rol_descripcion) || null,
      rol_nivel_acceso: Number(rol_nivel_acceso),
      rol_estado: normalizeEstado(rol_estado),
      rol_fecha_creacion: rol_fecha_creacion || null
    };

    const validationError = await validarRol(payload, rolId);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (!canManageRoleLevel(req, rolAnterior.ROL_NIVEL_ACCESO) ||
        !canManageRoleLevel(req, payload.rol_nivel_acceso)) {
      return res.status(403).json({
        message: "No puede modificar roles de nivel igual o superior al suyo"
      });
    }

    const sql = `
      UPDATE EMP_ROLES
      SET
        ROL_NOMBRE = :rol_nombre,
        ROL_DESCRIPCION = :rol_descripcion,
        ROL_NIVEL_ACCESO = :rol_nivel_acceso,
        ROL_ESTADO = :rol_estado,
        ROL_FECHA_CREACION = NVL(TO_DATE(:rol_fecha_creacion, 'YYYY-MM-DD'), ROL_FECHA_CREACION)
      WHERE ROL_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, payload);

      if (result.rowsAffected === 0) {
        const error = new Error("Rol no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "UPDATE",
        tabla: "EMP_ROLES",
        registroId: rolId,
        descripcion: `Rol actualizado: ${payload.rol_nombre}`,
        valorAnterior: rolAnterior,
        valorNuevo: payload
      }, execute);
    });

    res.json({ message: "Rol actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error actualizando rol",
      error: error.message
    });
  }
}

export async function deleteRol(req, res) {
  try {
    const { id } = req.params;
    const rolId = getParamId(id);

    if (!rolId) {
      return res.status(400).json({ message: "El id del rol debe ser numerico" });
    }

    const rolAnterior = await getRolSnapshot(rolId);

    if (!rolAnterior) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    if (isCurrentRole(req, rolId)) {
      return res.status(403).json({
        message: "No puede inactivar el rol con el que esta autenticado"
      });
    }

    if (!canManageRoleLevel(req, rolAnterior.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede inactivar roles de nivel igual o superior al suyo"
      });
    }

    if (await countUsuariosActivosRol(rolId) > 0) {
      return res.status(409).json({
        message: "No se puede inactivar el rol porque tiene usuarios activos"
      });
    }

    const sql = `
      UPDATE EMP_ROLES
      SET ROL_ESTADO = 'I'
      WHERE ROL_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, { id: rolId });

      if (result.rowsAffected === 0) {
        const error = new Error("Rol no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "INACTIVATE",
        tabla: "EMP_ROLES",
        registroId: rolId,
        descripcion: "Rol inactivado",
        valorAnterior: rolAnterior,
        valorNuevo: { rol_estado: "I" }
      }, execute);
    });

    res.json({ message: "Rol inactivado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error eliminando rol",
      error: error.message
    });
  }
}

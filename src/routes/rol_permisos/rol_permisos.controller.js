import { executeQuery, executeTransaction } from "../../config/db.js";
import { registrarBitacora } from "../../utils/auditoria.js";
import { canManageRoleLevel, getActorAccessLevel, isCurrentRole } from "../../utils/adminAccess.js";

function toNumberOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue || trimmedValue.toLowerCase() === "null" || trimmedValue.toLowerCase() === "undefined") {
      return null;
    }

    const numberValue = Number(trimmedValue);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getParamId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

async function existeRol(rolId) {
  return Boolean(await getRolSnapshot(rolId));
}

async function getRolSnapshot(rolId) {
  const result = await executeQuery(
    `
      SELECT
        ROL_ID,
        ROL_NOMBRE,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO
      FROM EMP_ROLES
      WHERE ROL_ID = :rol_id
        AND NVL(ROL_ESTADO, 'A') = 'A'
    `,
    { rol_id: rolId }
  );

  return result.rows[0] || null;
}

async function existePermiso(perId) {
  return Boolean(await getPermisoSnapshot(perId));
}

async function getPermisoSnapshot(perId) {
  const result = await executeQuery(
    `
      SELECT
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      FROM EMP_PERMISOS
      WHERE PERMISOS_ID = :per_id
    `,
    { per_id: perId }
  );

  return result.rows[0] || null;
}

async function existeAsignacion(rolId, perId, rpeId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_ROL_PERMISOS
      WHERE ROL_ID = :rol_id
        AND PER_ID = :per_id
        AND (:rpe_id IS NULL OR RPE_ID <> :rpe_id)
    `,
    { rol_id: rolId, per_id: perId, rpe_id: rpeId }
  );

  return result.rows.length > 0;
}

async function validarRolPermiso(payload, rpeId = null) {
  if (!Number.isFinite(payload.rol_id)) {
    return "El rol es obligatorio";
  }

  if (!Number.isFinite(payload.per_id)) {
    return "El permiso es obligatorio";
  }

  if (!(await existeRol(payload.rol_id))) {
    return "El rol indicado no existe";
  }

  if (!(await existePermiso(payload.per_id))) {
    return "El permiso indicado no existe";
  }

  if (await existeAsignacion(payload.rol_id, payload.per_id, rpeId)) {
    return "El permiso ya esta asignado a ese rol";
  }

  return null;
}

async function getAsignacionSnapshot(rpeId) {
  const result = await executeQuery(
    `
      SELECT
        rp.RPE_ID,
        rp.PER_ID,
        rp.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_NIVEL_ACCESO,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO
      FROM EMP_ROL_PERMISOS rp
      INNER JOIN EMP_ROLES r ON r.ROL_ID = rp.ROL_ID
      INNER JOIN EMP_PERMISOS p ON p.PERMISOS_ID = rp.PER_ID
      WHERE rp.RPE_ID = :id
    `,
    { id: rpeId }
  );

  return result.rows[0] || null;
}

function puedeAsignarPermiso(req, perId) {
  if (getActorAccessLevel(req) === 1) {
    return true;
  }

  return Array.isArray(req.usuario?.permisos) &&
    req.usuario.permisos.some((permiso) => Number(permiso.PERMISOS_ID) === Number(perId));
}

export async function getRolPermisos(req, res) {
  try {
    const sql = `
      SELECT
        rp.RPE_ID,
        rp.PER_ID,
        rp.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_NIVEL_ACCESO,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
      FROM EMP_ROL_PERMISOS rp
      INNER JOIN EMP_ROLES r ON r.ROL_ID = rp.ROL_ID
      INNER JOIN EMP_PERMISOS p ON p.PERMISOS_ID = rp.PER_ID
      ORDER BY r.ROL_NIVEL_ACCESO, r.ROL_NOMBRE, p.PER_MODULO, p.PER_NOMBRE_PERMISO
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo rol permisos",
      error: error.message
    });
  }
}

export async function getRolPermisoById(req, res) {
  try {
    const { id } = req.params;
    const rpeId = getParamId(id);

    if (!rpeId) {
      return res.status(400).json({ message: "El id de la relacion debe ser numerico" });
    }

    const sql = `
      SELECT
        rp.RPE_ID,
        rp.PER_ID,
        rp.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_NIVEL_ACCESO,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
      FROM EMP_ROL_PERMISOS rp
      INNER JOIN EMP_ROLES r ON r.ROL_ID = rp.ROL_ID
      INNER JOIN EMP_PERMISOS p ON p.PERMISOS_ID = rp.PER_ID
      WHERE rp.RPE_ID = :id
    `;

    const result = await executeQuery(sql, { id: rpeId });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Relacion rol-permiso no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo rol-permiso",
      error: error.message
    });
  }
}

export async function createRolPermiso(req, res) {
  try {
    const {
      per_id,
      rol_id
    } = req.body;
    const payload = {
      per_id: toNumberOrNull(per_id),
      rol_id: toNumberOrNull(rol_id)
    };

    const validationError = await validarRolPermiso(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const rol = await getRolSnapshot(payload.rol_id);

    if (!canManageRoleLevel(req, rol?.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede asignar permisos a roles de nivel igual o superior al suyo"
      });
    }

    if (!puedeAsignarPermiso(req, payload.per_id)) {
      return res.status(403).json({
        message: "No puede asignar permisos que su rol no posee"
      });
    }

    const sql = `
      INSERT INTO EMP_ROL_PERMISOS (
        RPE_ID,
        PER_ID,
        ROL_ID
      )
      VALUES (
        EMP_ROL_PERMISOS_SEQ.NEXTVAL,
        :per_id,
        :rol_id
      )
    `;

    await executeTransaction(async ({ execute }) => {
      await execute(sql, payload);

      await registrarBitacora(req, {
        accion: "ASSIGN_PERMISSION",
        tabla: "EMP_ROL_PERMISOS",
        descripcion: `Permiso ${payload.per_id} asignado al rol ${payload.rol_id}`,
        valorNuevo: payload
      }, execute);
    });

    res.status(201).json({ message: "Rol-permiso creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando rol-permiso",
      error: error.message
    });
  }
}

export async function updateRolPermiso(req, res) {
  try {
    const { id } = req.params;
    const rpeId = getParamId(id);

    if (!rpeId) {
      return res.status(400).json({ message: "El id de la relacion debe ser numerico" });
    }

    const asignacionAnterior = await getAsignacionSnapshot(rpeId);

    if (!asignacionAnterior) {
      return res.status(404).json({ message: "Relacion rol-permiso no encontrada" });
    }

    if (isCurrentRole(req, asignacionAnterior.ROL_ID)) {
      return res.status(403).json({
        message: "No puede modificar permisos del rol con el que esta autenticado"
      });
    }

    const {
      per_id,
      rol_id
    } = req.body;
    const payload = {
      id: rpeId,
      per_id: toNumberOrNull(per_id),
      rol_id: toNumberOrNull(rol_id)
    };

    const validationError = await validarRolPermiso(payload, rpeId);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const rol = await getRolSnapshot(payload.rol_id);

    if (isCurrentRole(req, payload.rol_id)) {
      return res.status(403).json({
        message: "No puede modificar permisos del rol con el que esta autenticado"
      });
    }

    if (!canManageRoleLevel(req, asignacionAnterior.ROL_NIVEL_ACCESO) ||
        !canManageRoleLevel(req, rol?.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede administrar permisos de roles de nivel igual o superior al suyo"
      });
    }

    if (!puedeAsignarPermiso(req, payload.per_id)) {
      return res.status(403).json({
        message: "No puede asignar permisos que su rol no posee"
      });
    }

    const sql = `
      UPDATE EMP_ROL_PERMISOS
      SET
        PER_ID = :per_id,
        ROL_ID = :rol_id
      WHERE RPE_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, payload);

      if (result.rowsAffected === 0) {
        const error = new Error("Relacion rol-permiso no encontrada");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "UPDATE",
        tabla: "EMP_ROL_PERMISOS",
        registroId: rpeId,
        descripcion: `Asignacion rol-permiso actualizada: ${rpeId}`,
        valorAnterior: asignacionAnterior,
        valorNuevo: payload
      }, execute);
    });

    res.json({ message: "Rol-permiso actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error actualizando rol-permiso",
      error: error.message
    });
  }
}

export async function deleteRolPermiso(req, res) {
  try {
    const { id } = req.params;
    const rpeId = getParamId(id);

    if (!rpeId) {
      return res.status(400).json({ message: "El id de la relacion debe ser numerico" });
    }

    const asignacionAnterior = await getAsignacionSnapshot(rpeId);

    if (!asignacionAnterior) {
      return res.status(404).json({ message: "Relacion rol-permiso no encontrada" });
    }

    if (isCurrentRole(req, asignacionAnterior.ROL_ID)) {
      return res.status(403).json({
        message: "No puede eliminar permisos del rol con el que esta autenticado"
      });
    }

    if (!canManageRoleLevel(req, asignacionAnterior.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede eliminar permisos de roles de nivel igual o superior al suyo"
      });
    }

    const sql = `
      DELETE FROM EMP_ROL_PERMISOS
      WHERE RPE_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, { id: rpeId });

      if (result.rowsAffected === 0) {
        const error = new Error("Relacion rol-permiso no encontrada");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "REMOVE_PERMISSION",
        tabla: "EMP_ROL_PERMISOS",
        registroId: rpeId,
        descripcion: `Asignacion rol-permiso eliminada: ${rpeId}`,
        valorAnterior: asignacionAnterior
      }, execute);
    });

    res.json({ message: "Rol-permiso eliminado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error eliminando rol-permiso",
      error: error.message
    });
  }
}

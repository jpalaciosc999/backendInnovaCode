import { executeQuery, executeTransaction } from "../../config/db.js";
import { registrarBitacora } from "../../utils/auditoria.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function getParamId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

async function existePermiso(nombre, modulo, permisoId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_PERMISOS
      WHERE LOWER(PER_NOMBRE_PERMISO) = LOWER(:nombre)
        AND LOWER(NVL(PER_MODULO, '')) = LOWER(NVL(:modulo, ''))
        AND (:permiso_id IS NULL OR PERMISOS_ID <> :permiso_id)
    `,
    { nombre, modulo, permiso_id: permisoId }
  );

  return result.rows.length > 0;
}

async function validarPermiso(payload, permisoId = null) {
  if (!payload.per_nombre_permiso) {
    return "El nombre del permiso es obligatorio";
  }

  if (!payload.per_modulo) {
    return "El modulo del permiso es obligatorio";
  }

  if (await existePermiso(payload.per_nombre_permiso, payload.per_modulo, permisoId)) {
    return "Ya existe ese permiso para el modulo indicado";
  }

  return null;
}

async function getPermisoSnapshot(permisoId) {
  const result = await executeQuery(
    `
      SELECT
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION,
        COUNT(rp.ROL_ID) AS TOTAL_ROLES_ASIGNADOS
      FROM EMP_PERMISOS p
      LEFT JOIN EMP_ROL_PERMISOS rp ON rp.PER_ID = p.PERMISOS_ID
      WHERE p.PERMISOS_ID = :id
      GROUP BY
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
    `,
    { id: permisoId }
  );

  return result.rows[0] || null;
}

export async function getPermisos(req, res) {
  try {
    const sql = `
      SELECT
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION,
        COUNT(rp.ROL_ID) AS TOTAL_ROLES_ASIGNADOS
      FROM EMP_PERMISOS p
      LEFT JOIN EMP_ROL_PERMISOS rp ON rp.PER_ID = p.PERMISOS_ID
      GROUP BY
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
      ORDER BY p.PER_MODULO, p.PER_NOMBRE_PERMISO
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo permisos",
      error: error.message
    });
  }
}

export async function getPermisoById(req, res) {
  try {
    const { id } = req.params;
    const permisoId = getParamId(id);

    if (!permisoId) {
      return res.status(400).json({ message: "El id del permiso debe ser numerico" });
    }

    const sql = `
      SELECT
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION,
        COUNT(rp.ROL_ID) AS TOTAL_ROLES_ASIGNADOS
      FROM EMP_PERMISOS p
      LEFT JOIN EMP_ROL_PERMISOS rp ON rp.PER_ID = p.PERMISOS_ID
      WHERE p.PERMISOS_ID = :id
      GROUP BY
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
    `;

    const result = await executeQuery(sql, { id: permisoId });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Permiso no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo permiso",
      error: error.message
    });
  }
}

export async function createPermiso(req, res) {
  try {
    const {
      per_nombre_permiso,
      per_modulo,
      per_descripcion
    } = req.body;
    const payload = {
      per_nombre_permiso: normalizeString(per_nombre_permiso),
      per_modulo: normalizeString(per_modulo),
      per_descripcion: normalizeString(per_descripcion) || null
    };

    const validationError = await validarPermiso(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const sql = `
      INSERT INTO EMP_PERMISOS (
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      )
      VALUES (
        EMP_PERMISOS_SEQ.NEXTVAL,
        :per_nombre_permiso,
        :per_modulo,
        :per_descripcion
      )
    `;

    await executeTransaction(async ({ execute }) => {
      await execute(sql, payload);

      await registrarBitacora(req, {
        accion: "CREATE",
        tabla: "EMP_PERMISOS",
        descripcion: `Permiso creado: ${payload.per_modulo} / ${payload.per_nombre_permiso}`,
        valorNuevo: payload
      }, execute);
    });

    res.status(201).json({ message: "Permiso creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando permiso",
      error: error.message
    });
  }
}

export async function updatePermiso(req, res) {
  try {
    const { id } = req.params;
    const permisoId = getParamId(id);

    if (!permisoId) {
      return res.status(400).json({ message: "El id del permiso debe ser numerico" });
    }

    const permisoAnterior = await getPermisoSnapshot(permisoId);

    if (!permisoAnterior) {
      return res.status(404).json({ message: "Permiso no encontrado" });
    }

    const {
      per_nombre_permiso,
      per_modulo,
      per_descripcion
    } = req.body;
    const payload = {
      id: permisoId,
      per_nombre_permiso: normalizeString(per_nombre_permiso),
      per_modulo: normalizeString(per_modulo),
      per_descripcion: normalizeString(per_descripcion) || null
    };

    const validationError = await validarPermiso(payload, permisoId);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const cambiaIdentidad = permisoAnterior.PER_NOMBRE_PERMISO !== payload.per_nombre_permiso ||
      permisoAnterior.PER_MODULO !== payload.per_modulo;

    if (Number(permisoAnterior.TOTAL_ROLES_ASIGNADOS) > 0 && cambiaIdentidad) {
      return res.status(409).json({
        message: "No se puede cambiar el nombre o modulo de un permiso asignado a roles"
      });
    }

    const sql = `
      UPDATE EMP_PERMISOS
      SET
        PER_NOMBRE_PERMISO = :per_nombre_permiso,
        PER_MODULO = :per_modulo,
        PER_DESCRIPCION = :per_descripcion
      WHERE PERMISOS_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, payload);

      if (result.rowsAffected === 0) {
        const error = new Error("Permiso no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "UPDATE",
        tabla: "EMP_PERMISOS",
        registroId: permisoId,
        descripcion: `Permiso actualizado: ${payload.per_modulo} / ${payload.per_nombre_permiso}`,
        valorAnterior: permisoAnterior,
        valorNuevo: payload
      }, execute);
    });

    res.json({ message: "Permiso actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error actualizando permiso",
      error: error.message
    });
  }
}

export async function deletePermiso(req, res) {
  try {
    const { id } = req.params;
    const permisoId = getParamId(id);

    if (!permisoId) {
      return res.status(400).json({ message: "El id del permiso debe ser numerico" });
    }

    const permisoAnterior = await getPermisoSnapshot(permisoId);

    if (!permisoAnterior) {
      return res.status(404).json({ message: "Permiso no encontrado" });
    }

    const usado = await executeQuery(
      `
        SELECT 1
        FROM EMP_ROL_PERMISOS
        WHERE PER_ID = :id
          AND ROWNUM = 1
      `,
      { id: permisoId }
    );

    if (usado.rows.length > 0) {
      return res.status(409).json({
        message: "No se puede eliminar el permiso porque esta asignado a un rol"
      });
    }

    const sql = `
      DELETE FROM EMP_PERMISOS
      WHERE PERMISOS_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, { id: permisoId });

      if (result.rowsAffected === 0) {
        const error = new Error("Permiso no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "DELETE",
        tabla: "EMP_PERMISOS",
        registroId: permisoId,
        descripcion: "Permiso eliminado",
        valorAnterior: permisoAnterior
      }, execute);
    });

    res.json({ message: "Permiso eliminado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error eliminando permiso",
      error: error.message
    });
  }
}

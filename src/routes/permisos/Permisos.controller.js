import { executeQuery } from "../../config/db.js";

export async function getPermisos(req, res) {
  try {
    const sql = `
      SELECT
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      FROM EMP_PERMISOS
      ORDER BY PERMISOS_ID
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

    const sql = `
      SELECT
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      FROM EMP_PERMISOS
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

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

    await executeQuery(sql, {
      per_nombre_permiso,
      per_modulo,
      per_descripcion
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
    const {
      per_nombre_permiso,
      per_modulo,
      per_descripcion
    } = req.body;

    const sql = `
      UPDATE EMP_PERMISOS
      SET
        PER_NOMBRE_PERMISO = :per_nombre_permiso,
        PER_MODULO = :per_modulo,
        PER_DESCRIPCION = :per_descripcion
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      per_nombre_permiso,
      per_modulo,
      per_descripcion
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Permiso no encontrado" });
    }

    res.json({ message: "Permiso actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando permiso",
      error: error.message
    });
  }
}

export async function deletePermiso(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_PERMISOS
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Permiso no encontrado" });
    }

    res.json({ message: "Permiso eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando permiso",
      error: error.message
    });
  }
}
import { executeQuery } from "../../config/db.js";

export async function getRolPermisos(req, res) {
  try {
    const sql = `
      SELECT
        RPE_ID,
        PER_ID,
        ROL_ID
      FROM NOM_ROL_PERMISOS
      ORDER BY RPE_ID
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

    const sql = `
      SELECT
        RPE_ID,
        PER_ID,
        ROL_ID
      FROM NOM_ROL_PERMISOS
      WHERE RPE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Relación rol-permiso no encontrada" });
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

    const sql = `
      INSERT INTO NOM_ROL_PERMISOS (
        RPE_ID,
        PER_ID,
        ROL_ID
      )
      VALUES (
        NOM_ROL_PERMISOS_SEQ.NEXTVAL,
        :per_id,
        :rol_id
      )
    `;

    await executeQuery(sql, {
      per_id,
      rol_id
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
    const {
      per_id,
      rol_id
    } = req.body;

    const sql = `
      UPDATE NOM_ROL_PERMISOS
      SET
        PER_ID = :per_id,
        ROL_ID = :rol_id
      WHERE RPE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      per_id,
      rol_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Relación rol-permiso no encontrada" });
    }

    res.json({ message: "Rol-permiso actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando rol-permiso",
      error: error.message
    });
  }
}

export async function deleteRolPermiso(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_ROL_PERMISOS
      WHERE RPE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Relación rol-permiso no encontrada" });
    }

    res.json({ message: "Rol-permiso eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando rol-permiso",
      error: error.message
    });
  }
}
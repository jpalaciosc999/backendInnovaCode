import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER TODOS LOS PERMISOS
======================= */
export async function getPermisos(req, res) {
  try {
    const sql = `
      SELECT 
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      FROM NOM_PERMISOS
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

/* =======================
   OBTENER PERMISO POR ID
======================= */
export async function getPermisoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      FROM NOM_PERMISOS
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Permiso no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo permiso",
      error: error.message
    });
  }
}

/* =======================
   CREAR PERMISO
======================= */
export async function createPermiso(req, res) {
  try {
    const { nombre, modulo, descripcion } = req.body;

    if (!nombre || !modulo || !descripcion) {
      return res.status(400).json({
        message: "Todos los campos son obligatorios"
      });
    }

    const sql = `
      INSERT INTO NOM_PERMISOS (
        PERMISOS_ID,
        PER_NOMBRE_PERMISO,
        PER_MODULO,
        PER_DESCRIPCION
      ) VALUES (
        NOM_PERMISOS_SEQ.NEXTVAL,
        :nombre,
        :modulo,
        :descripcion
      )
    `;

    await executeQuery(sql, { nombre, modulo, descripcion });

    res.status(201).json({
      message: "Permiso creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando permiso",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR PERMISO
======================= */
export async function updatePermiso(req, res) {
  try {
    const { id } = req.params;
    const { nombre, modulo, descripcion } = req.body;

    const sql = `
      UPDATE NOM_PERMISOS
      SET 
        PER_NOMBRE_PERMISO = :nombre,
        PER_MODULO = :modulo,
        PER_DESCRIPCION = :descripcion
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre,
      modulo,
      descripcion
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Permiso no encontrado"
      });
    }

    res.json({
      message: "Permiso actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando permiso",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR PERMISO
======================= */
export async function deletePermiso(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_PERMISOS
      WHERE PERMISOS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Permiso no encontrado"
      });
    }

    res.json({
      message: "Permiso eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando permiso",
      error: error.message
    });
  }
}
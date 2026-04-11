import { executeQuery } from "../../config/db.js";

export async function getRoles(req, res) {
  try {
    const sql = `
      SELECT
        ROL_ID,
        ROL_NOMBRE,
        ROL_DESCRIPCION,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      FROM EMP_ROLES
      ORDER BY ROL_ID
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

    const sql = `
      SELECT
        ROL_ID,
        ROL_NOMBRE,
        ROL_DESCRIPCION,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      FROM EMP_ROLES
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

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
        TO_DATE(:rol_fecha_creacion, 'YYYY-MM-DD')
      )
    `;

    await executeQuery(sql, {
      rol_nombre,
      rol_descripcion,
      rol_nivel_acceso,
      rol_estado,
      rol_fecha_creacion
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
    const {
      rol_nombre,
      rol_descripcion,
      rol_nivel_acceso,
      rol_estado,
      rol_fecha_creacion
    } = req.body;

    const sql = `
      UPDATE EMP_ROLES
      SET
        ROL_NOMBRE = :rol_nombre,
        ROL_DESCRIPCION = :rol_descripcion,
        ROL_NIVEL_ACCESO = :rol_nivel_acceso,
        ROL_ESTADO = :rol_estado,
        ROL_FECHA_CREACION = TO_DATE(:rol_fecha_creacion, 'YYYY-MM-DD')
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      rol_nombre,
      rol_descripcion,
      rol_nivel_acceso,
      rol_estado,
      rol_fecha_creacion
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    res.json({ message: "Rol actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando rol",
      error: error.message
    });
  }
}

export async function deleteRol(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_ROLES
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    res.json({ message: "Rol eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando rol",
      error: error.message
    });
  }
}
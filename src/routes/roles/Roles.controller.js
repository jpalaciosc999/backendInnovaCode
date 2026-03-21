import { executeQuery } from "../../config/db.js";

export async function getRoles(req, res) {
    try {
        const sql = `
          SELECT
            ROL_ID,
            ROL_NOMBRE,
            ROL_NIVEL_ACCESO,
            ROL_ESTADO
            ROL_FECHA_CREACION
          FROM NOM_PERMISOS
        `;

        const result = await executeQuery(sql);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: "Error obtenido roles",
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
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      FROM NOM_ROLES
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rol no encontrado"
      });
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
    const { nombre, nivel_acceso, estado } = req.body;

    if (!nombre || !nivel_acceso || !estado) {
      return res.status(400).json({
        message: "Todos los campos son obligatorios"
      });
    }

    const sql = `
      INSERT INTO NOM_ROLES (
        ROL_ID,
        ROL_NOMBRE,
        ROL_NIVEL_ACCESO,
        ROL_ESTADO,
        ROL_FECHA_CREACION
      ) VALUES (
        NOM_ROLES_SEQ.NEXTVAL,
        :nombre,
        :nivel_acceso,
        :estado,
        SYSDATE
      )
    `;

    await executeQuery(sql, { nombre, nivel_acceso, estado });

    res.status(201).json({
      message: "Rol creado correctamente"
    });
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
    const { nombre, nivel_acceso, estado } = req.body;

    const sql = `
      UPDATE NOM_ROLES
      SET 
        ROL_NOMBRE = :nombre,
        ROL_NIVEL_ACCESO = :nivel_acceso,
        ROL_ESTADO = :estado
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre,
      nivel_acceso,
      estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Rol no encontrado"
      });
    }

    res.json({
      message: "Rol actualizado correctamente"
    });
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
      DELETE FROM NOM_ROLES
      WHERE ROL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Rol no encontrado"
      });
    }

    res.json({
      message: "Rol eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando rol",
      error: error.message
    });
  }
}
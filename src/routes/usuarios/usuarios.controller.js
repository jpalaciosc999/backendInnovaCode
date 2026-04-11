import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER USUARIOS
======================= */
export async function getUsuarios(req, res) {
  try {
    const sql = `
      SELECT *
      FROM EMP_USUARIO
    `;

    const result = await executeQuery(sql);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo usuarios",
      error: error.message
    });
  }
}

/* =======================
   OBTENER USUARIO POR ID
======================= */
export async function getUsuarioById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT *
      FROM EMP_USUARIO
      WHERE USU_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo usuario",
      error: error.message
    });
  }
}

/* =======================
   CREAR USUARIO
======================= */
export async function createUsuario(req, res) {
  try {
    const {
      username,
      password,
      nombre_completo,
      correo,
      estado,
      rol_id,
      emp_id
    } = req.body;

    if (!username || !password || !nombre_completo || !correo) {
      return res.status(400).json({
        message: "Campos obligatorios faltantes"
      });
    }

    const sql = `
      INSERT INTO EMP_USUARIO (
        USU_ID,
        USU_USERNAME,
        USU_PASSWORD,
        USU_NOMBRE_COMPLETO,
        USU_CORREO,
        USU_ESTADO,
        USU_FECHA_CREACION,
        ROL_ID,
        EMP_ID
      ) VALUES (
        EMP_USUARIO_SEQ.NEXTVAL,
        :username,
        :password,
        :nombre_completo,
        :correo,
        :estado,
        SYSDATE,
        :rol_id,
        :emp_id
      )
    `;

    await executeQuery(sql, {
      username,
      password,
      nombre_completo,
      correo,
      estado,
      rol_id,
      emp_id
    });

    res.status(201).json({
      message: "Usuario creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando usuario",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR USUARIO
======================= */
export async function updateUsuario(req, res) {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      nombre_completo,
      correo,
      estado,
      rol_id,
      emp_id
    } = req.body;

    const sql = `
      UPDATE EMP_USUARIO
      SET 
        USU_USERNAME = :username,
        USU_PASSWORD = :password,
        USU_NOMBRE_COMPLETO = :nombre_completo,
        USU_CORREO = :correo,
        USU_ESTADO = :estado,
        ROL_ID = :rol_id,
        EMP_ID = :emp_id
      WHERE USU_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      username,
      password,
      nombre_completo,
      correo,
      estado,
      rol_id,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json({
      message: "Usuario actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando usuario",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR USUARIO
======================= */
export async function deleteUsuario(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_USUARIO
      WHERE USU_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    res.json({
      message: "Usuario eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando usuario",
      error: error.message
    });
  }
}
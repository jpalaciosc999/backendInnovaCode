import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER
======================= */
export async function getDepartamentos(req, res) {
  try {
    const result = await executeQuery(`SELECT * FROM NOM_DEPARTAMENTO`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo departamentos",
      error: error.message
    });
  }
}

/* =======================
   POR ID
======================= */
export async function getDepartamentoById(req, res) {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      `SELECT * FROM NOM_DEPARTAMENTO WHERE DEP_ID = :id`,
      { id: Number(id) }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Departamento no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo departamento",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createDepartamento(req, res) {
  try {
    const { nombre, descripcion, estado } = req.body;

    const sql = `
      INSERT INTO NOM_DEPARTAMENTO (
        DEP_ID,
        DEP_NOMBRE,
        DEP_DESCRIPCION,
        DEP_ESTADO,
        DEP_FECHA_CREACION
      ) VALUES (
        NOM_DEP_SEQ.NEXTVAL,
        :nombre,
        :descripcion,
        :estado,
        SYSDATE
      )
    `;

    await executeQuery(sql, { nombre, descripcion, estado });

    res.status(201).json({
      message: "Departamento creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando departamento",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateDepartamento(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;

    const sql = `
      UPDATE NOM_DEPARTAMENTO
      SET 
        DEP_NOMBRE = :nombre,
        DEP_DESCRIPCION = :descripcion,
        DEP_ESTADO = :estado,
        DEP_MODIFICACION = SYSDATE
      WHERE DEP_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre,
      descripcion,
      estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Departamento no encontrado"
      });
    }

    res.json({
      message: "Departamento actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando departamento",
      error: error.message
    });
  }
}

/* =======================
   BORRADO LÓGICO
======================= */
export async function deleteDepartamentoLogico(req, res) {
  try {
    const { id } = req.params;

    await executeQuery(
      `UPDATE NOM_DEPARTAMENTO SET DEP_ESTADO = 'I' WHERE DEP_ID = :id`,
      { id: Number(id) }
    );

    res.json({
      message: "Departamento desactivado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando departamento",
      error: error.message
    });
  }
}
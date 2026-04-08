import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER TODOS
======================= */
export async function getMarcajes(req, res) {
  try {
    const sql = `SELECT * FROM EMP_MARCAJE`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo marcajes",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_MARCAJE
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Marcaje no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo marcaje",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createMarcaje(req, res) {
  try {
    const {
      fecha,
      entrada,
      salida,
      horas_extra,
      estado,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        MAR_HORAS_EXTRA,
        MAR_ESTADO,
        EMP_ID
      ) VALUES (
        EMP_MARCAJE_SEQ.NEXTVAL,
        :fecha,
        :entrada,
        :salida,
        :horas_extra,
        :estado,
        :emp_id
      )
    `;

    await executeQuery(sql, {
      fecha,
      entrada,
      salida,
      horas_extra,
      estado,
      emp_id
    });

    res.status(201).json({
      message: "Marcaje creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const {
      fecha,
      entrada,
      salida,
      horas_extra,
      estado,
      emp_id
    } = req.body;

    const sql = `
      UPDATE EMP_MARCAJE
      SET 
        MAR_FECHA = :fecha,
        MAR_ENTRADA = :entrada,
        MAR_SALIDA = :salida,
        MAR_HORAS_EXTRA = :horas_extra,
        MAR_ESTADO = :estado,
        EMP_ID = :emp_id
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha,
      entrada,
      salida,
      horas_extra,
      estado,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Marcaje no encontrado"
      });
    }

    res.json({
      message: "Marcaje actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando marcaje",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteMarcaje(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_MARCAJE
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Marcaje no encontrado"
      });
    }

    res.json({
      message: "Marcaje eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}
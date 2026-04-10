import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER INGRESOS
======================= */
export async function getIngresos(req, res) {
  try {
    // Cambio a tabla EMP_INGRESO
    const sql = `SELECT * FROM EMP_INGRESO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo ingresos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getIngresoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_INGRESO
      WHERE TIS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Ingreso no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo ingreso",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createIngreso(req, res) {
  try {
    const {
      tis_codigo,
      tis_nombre,
      tis_descripcion,
      tis_valor_base,
      tis_es_recurrente
    } = req.body;

    // Ajustado: EMP_INGRESO, EMP_INGRESO_SEQ y nombres de columnas correctos
    const sql = `
      INSERT INTO EMP_INGRESO (
        TIS_ID,
        TIS_CODIGO,
        TIS_NOMBRE,
        TIS_DESCRIPCION,
        TIS_VALOR_BASE,
        TIS_ES_RECURRENTE,
        TIS_FECHA_MODIFICACION
      ) VALUES (
        EMP_INGRESO_SEQ.NEXTVAL,
        :codigo,
        :nombre,
        :descripcion,
        :valor_base,
        :es_recurrente,
        SYSDATE
      )
    `;

    await executeQuery(sql, {
      codigo: tis_codigo,
      nombre: tis_nombre,
      descripcion: tis_descripcion,
      valor_base: tis_valor_base,
      es_recurrente: tis_es_recurrente
    });

    res.status(201).json({
      message: "Ingreso creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando ingreso",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateIngreso(req, res) {
  try {
    const { id } = req.params;
    const {
      tis_codigo,
      tis_nombre,
      tis_descripcion,
      tis_valor_base,
      tis_es_recurrente
    } = req.body;

    const sql = `
      UPDATE EMP_INGRESO
      SET 
        TIS_CODIGO = :codigo,
        TIS_NOMBRE = :nombre,
        TIS_DESCRIPCION = :descripcion,
        TIS_VALOR_BASE = :valor_base,
        TIS_ES_RECURRENTE = :es_recurrente,
        TIS_FECHA_MODIFICACION = SYSDATE
      WHERE TIS_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      codigo: tis_codigo,
      nombre: tis_nombre,
      descripcion: tis_descripcion,
      valor_base: tis_valor_base,
      es_recurrente: tis_es_recurrente
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Ingreso no encontrado"
      });
    }

    res.json({
      message: "Ingreso actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando ingreso",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteIngreso(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_INGRESO
      WHERE TIS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Ingreso no encontrado"
      });
    }

    res.json({
      message: "Ingreso eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando ingreso",
      error: error.message
    });
  }
}
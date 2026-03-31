import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER DESCUENTOS
======================= */
export async function getDescuentos(req, res) {
  try {
    const sql = `SELECT * FROM NOM_DESCUENTO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo descuentos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getDescuentoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_DESCUENTO
      WHERE TDS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Descuento no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo descuento",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createDescuento(req, res) {
  try {
    const {
      tds_codigo,
      tds_nombre,
      tds_descripcion,
      tds_tipo_calculo,
      tds_valor_base,
      tds_porcentaje,
      tds_es_obligatorio,
      tds_estado
    } = req.body;

    const sql = `
      INSERT INTO NOM_DESCUENTO (
        TDS_ID,
        TDS_CODIGO,
        TDS_NOMBRE,
        TDS_DESCRIPCION,
        TDS_TIPO_CALCULO,
        TDS_VALOR_BASE,
        TDS_PORCENTAJE,
        TDS_ES_OBLIGATORIO,
        TDS_ESTADO,
        TDS_FECHA_CREACION,
        TDS_MODIFICACION
      ) VALUES (
        NOM_DESCUENTO_SEQ.NEXTVAL,
        :codigo,
        :nombre,
        :descripcion,
        :tipo_calculo,
        :valor_base,
        :porcentaje,
        :es_obligatorio,
        :estado,
        SYSDATE,
        SYSDATE
      )
    `;

    await executeQuery(sql, {
      codigo: tds_codigo,
      nombre: tds_nombre,
      descripcion: tds_descripcion,
      tipo_calculo: tds_tipo_calculo,
      valor_base: tds_valor_base,
      porcentaje: tds_porcentaje,
      es_obligatorio: tds_es_obligatorio,
      estado: tds_estado
    });

    res.status(201).json({
      message: "Descuento creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando descuento",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateDescuento(req, res) {
  try {
    const { id } = req.params;
    const {
      tds_codigo,
      tds_nombre,
      tds_descripcion,
      tds_tipo_calculo,
      tds_valor_base,
      tds_porcentaje,
      tds_es_obligatorio,
      tds_estado
    } = req.body;

    const sql = `
      UPDATE NOM_DESCUENTO
      SET 
        TDS_CODIGO = :codigo,
        TDS_NOMBRE = :nombre,
        TDS_DESCRIPCION = :descripcion,
        TDS_TIPO_CALCULO = :tipo_calculo,
        TDS_VALOR_BASE = :valor_base,
        TDS_PORCENTAJE = :porcentaje,
        TDS_ES_OBLIGATORIO = :es_obligatorio,
        TDS_ESTADO = :estado,
        TDS_MODIFICACION = SYSDATE
      WHERE TDS_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      codigo: tds_codigo,
      nombre: tds_nombre,
      descripcion: tds_descripcion,
      tipo_calculo: tds_tipo_calculo,
      valor_base: tds_valor_base,
      porcentaje: tds_porcentaje,
      es_obligatorio: tds_es_obligatorio,
      estado: tds_estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Descuento no encontrado"
      });
    }

    res.json({
      message: "Descuento actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando descuento",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteDescuento(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_DESCUENTO
      WHERE TDS_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Descuento no encontrado"
      });
    }

    res.json({
      message: "Descuento eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando descuento",
      error: error.message
    });
  }
}
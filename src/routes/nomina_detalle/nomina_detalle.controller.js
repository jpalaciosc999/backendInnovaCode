import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER DETALLES
======================= */
export async function getNominaDetalles(req, res) {
  try {
    const sql = `SELECT * FROM NOM_NOMINA_DETALLE`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalles de nómina",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getNominaDetalleById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_NOMINA_DETALLE
      WHERE DET_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Detalle no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalle",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createNominaDetalle(req, res) {
  try {
    const {
      referencia,
      monto,
      nom_id,
      tis_id,
      tds_id,
      pre_id,
      kre_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_NOMINA_DETALLE (
        DET_ID,
        DET_REFERENCIA,
        DET_MONTO,
        NOM_ID,
        TIS_ID,
        TDS_ID,
        PRE_ID,
        KRE_ID
      ) VALUES (
        NOM_NOMINA_DETALLE_SEQ.NEXTVAL,
        :referencia,
        :monto,
        :nom_id,
        :tis_id,
        :tds_id,
        :pre_id,
        :kre_id
      )
    `;

    await executeQuery(sql, {
      referencia,
      monto,
      nom_id,
      tis_id,
      tds_id,
      pre_id,
      kre_id
    });

    res.status(201).json({
      message: "Detalle de nómina creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando detalle de nómina",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateNominaDetalle(req, res) {
  try {
    const { id } = req.params;
    const {
      referencia,
      monto,
      nom_id,
      tis_id,
      tds_id,
      pre_id,
      kre_id
    } = req.body;

    const sql = `
      UPDATE NOM_NOMINA_DETALLE
      SET 
        DET_REFERENCIA = :referencia,
        DET_MONTO = :monto,
        NOM_ID = :nom_id,
        TIS_ID = :tis_id,
        TDS_ID = :tds_id,
        PRE_ID = :pre_id,
        KRE_ID = :kre_id
      WHERE DET_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      referencia,
      monto,
      nom_id,
      tis_id,
      tds_id,
      pre_id,
      kre_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Detalle no encontrado"
      });
    }

    res.json({
      message: "Detalle actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando detalle",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteNominaDetalle(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_NOMINA_DETALLE
      WHERE DET_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Detalle no encontrado"
      });
    }

    res.json({
      message: "Detalle eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando detalle",
      error: error.message
    });
  }
}
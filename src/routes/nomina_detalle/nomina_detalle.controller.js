import { executeQuery } from "../../config/db.js";

export async function getNominaDetalles(req, res) {
  try {
    const sql = `SELECT * FROM EMP_NOMINA_DETALLE`;

    const sql = `SELECT * FROM EMP_NOMINA_DETALLE ORDER BY DET_ID DESC`;
    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener", error: error.message });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getNominaDetalleById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_NOMINA_DETALLE
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
    const { det_referencia, det_monto, nom_id, tis_id, tds_id, kre_id } = req.body;
    const sql = `
      INSERT INTO EMP_NOMINA_DETALLE (
        DET_ID,
        DET_REFERENCIA,
        DET_MONTO,
        NOM_ID,
        TIS_ID,
        TDS_ID,
        PRE_ID,
        KRE_ID
      ) VALUES (
        EMP_NOMINA_DETALLE_SEQ.NEXTVAL,
        :referencia,
        :monto,
        :nom_id,
        :tis_id,
        :tds_id,
        :pre_id,
        :kre_id
        DET_ID, DET_REFERENCIA, DET_MONTO, NOM_ID, TIS_ID, TDS_ID, KRE_ID
      ) VALUES (
        EMP_NOMINA_DETALLE_SEQ.NEXTVAL, :ref, :mon, :nom, :tis, :tds, :kre
      )
    `;
    await executeQuery(sql, {
      ref: Number(det_referencia),
      mon: Number(det_monto),
      nom: Number(nom_id),
      tis: Number(tis_id),
      tds: Number(tds_id),
      kre: Number(kre_id)
    });
    res.status(201).json({ message: "Creado con éxito" });
  } catch (error) {
    res.status(500).json({ message: "Error al crear", error: error.message });
  }
}

export async function updateNominaDetalle(req, res) {
  try {
    const { id } = req.params;
    const { det_referencia, det_monto, nom_id, tis_id, tds_id, kre_id } = req.body;
    const sql = `
      UPDATE EMP_NOMINA_DETALLE
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
    await executeQuery(sql, {
      id: Number(id),
      ref: Number(det_referencia),
      mon: Number(det_monto),
      nom: Number(nom_id),
      tis: Number(tis_id),
      tds: Number(tds_id),
      kre: Number(kre_id)
    });
    res.json({ message: "Actualizado" });
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar", error: error.message });
  }
}

export async function deleteNominaDetalle(req, res) {
  try {
    const { id } = req.params;
    const sql = `
      DELETE FROM EMP_NOMINA_DETALLE
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
    await executeQuery(`DELETE FROM EMP_NOMINA_DETALLE WHERE DET_ID = :id`, { id: Number(id) });
    res.json({ message: "Eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar", error: error.message });
  }
}
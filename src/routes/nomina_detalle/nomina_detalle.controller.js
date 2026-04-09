import { executeQuery } from "../../config/db.js";

export async function getNominaDetalles(req, res) {
  try {
    const sql = `SELECT * FROM EMP_NOMINA_DETALLE ORDER BY DET_ID DESC`;
    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener", error: error.message });
  }
}

export async function createNominaDetalle(req, res) {
  try {
    const { det_referencia, det_monto, nom_id, tis_id, tds_id, kre_id } = req.body;
    const sql = `
      INSERT INTO EMP_NOMINA_DETALLE (
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
      UPDATE EMP_NOMINA_DETALLE SET 
        DET_REFERENCIA = :ref, DET_MONTO = :mon, NOM_ID = :nom, 
        TIS_ID = :tis, TDS_ID = :tds, KRE_ID = :kre
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
    await executeQuery(`DELETE FROM EMP_NOMINA_DETALLE WHERE DET_ID = :id`, { id: Number(id) });
    res.json({ message: "Eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar", error: error.message });
  }
}
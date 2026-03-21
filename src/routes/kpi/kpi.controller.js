import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER KPIs
======================= */
export async function getKpis(req, res) {
  try {
    const sql = `SELECT * FROM NOM_KPI`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo KPIs",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getKpiById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_KPI
      WHERE KPI_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "KPI no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo KPI",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createKpi(req, res) {
  try {
    const {
      nombre,
      tipo
    } = req.body;

    const sql = `
      INSERT INTO NOM_KPI (
        KPI_ID,
        KPI_NOMBRE,
        KPI_TIPO
      ) VALUES (
        NOM_KPI_SEQ.NEXTVAL,
        :nombre,
        :tipo
      )
    `;

    await executeQuery(sql, {
      nombre,
      tipo
    });

    res.status(201).json({
      message: "KPI creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando KPI",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateKpi(req, res) {
  try {
    const { id } = req.params;
    const {
      nombre,
      tipo
    } = req.body;

    const sql = `
      UPDATE NOM_KPI
      SET 
        KPI_NOMBRE = :nombre,
        KPI_TIPO = :tipo
      WHERE KPI_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre,
      tipo
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "KPI no encontrado"
      });
    }

    res.json({
      message: "KPI actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando KPI",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteKpi(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_KPI
      WHERE KPI_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "KPI no encontrado"
      });
    }

    res.json({
      message: "KPI eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando KPI",
      error: error.message
    });
  }
}
import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER TODOS LOS KPIs
======================= */
export async function getKpis(req, res) {
  try {
    const sql = `SELECT * FROM EMP_KPI ORDER BY KPI_ID DESC`;
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
   OBTENER KPI POR ID
======================= */
export async function getKpiById(req, res) {
  try {
    const { id } = req.params;
    const sql = `SELECT * FROM EMP_KPI WHERE KPI_ID = :id`;
    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "KPI no encontrado" });
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
   CREAR KPI
======================= */
export async function createKpi(req, res) {
  try {
    const { kpi_nombre, kpi_tipo, kpi_valor } = req.body;

    const sql = `
      INSERT INTO EMP_KPI (
        KPI_ID,
        KPI_NOMBRE,
        KPI_TIPO,
        KPI_VALOR
      ) VALUES (
        EMP_KPI_SEQ.NEXTVAL,
        :nombre,
        :tipo,
        :valor
      )
    `;

    await executeQuery(sql, {
      nombre: kpi_nombre,
      tipo: kpi_tipo,
      valor: Number(kpi_valor)
    });

    res.status(201).json({ message: "KPI creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando KPI",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR KPI
======================= */
export async function updateKpi(req, res) {
  try {
    const { id } = req.params;
    const { kpi_nombre, kpi_tipo, kpi_valor } = req.body;

    const sql = `
      UPDATE EMP_KPI
      SET 
        KPI_NOMBRE = :nombre,
        KPI_TIPO = :tipo,
        KPI_VALOR = :valor
      WHERE KPI_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre: kpi_nombre,
      tipo: kpi_tipo,
      valor: Number(kpi_valor)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "KPI no encontrado" });
    }

    res.json({ message: "KPI actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando KPI",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR KPI
======================= */
export async function deleteKpi(req, res) {
  try {
    const { id } = req.params;
    const sql = `DELETE FROM EMP_KPI WHERE KPI_ID = :id`;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "KPI no encontrado" });
    }

    res.json({ message: "KPI eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando KPI",
      error: error.message
    });
  }
}
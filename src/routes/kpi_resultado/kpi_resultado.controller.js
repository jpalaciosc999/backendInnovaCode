import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER RESULTADOS KPI
======================= */
export async function getKpiResultados(req, res) {
  try {
    const sql = `SELECT * FROM NOM_KPI_RESULTADO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo resultados KPI",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getKpiResultadoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_KPI_RESULTADO
      WHERE KRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Resultado KPI no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo resultado KPI",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createKpiResultado(req, res) {
  try {
    const {
      valor,
      fecha,
      kpi_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_KPI_RESULTADO (
        KRE_ID,
        KRE_VALOR,
        KRE_FECHA,
        KPI_ID
      ) VALUES (
        NOM_KPI_RESULTADO_SEQ.NEXTVAL,
        :valor,
        :fecha,
        :kpi_id
      )
    `;

    await executeQuery(sql, {
      valor,
      fecha,
      kpi_id
    });

    res.status(201).json({
      message: "Resultado KPI creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando resultado KPI",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateKpiResultado(req, res) {
  try {
    const { id } = req.params;
    const {
      valor,
      fecha,
      kpi_id
    } = req.body;

    const sql = `
      UPDATE NOM_KPI_RESULTADO
      SET 
        KRE_VALOR = :valor,
        KRE_FECHA = :fecha,
        KPI_ID = :kpi_id
      WHERE KRE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      valor,
      fecha,
      kpi_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Resultado KPI no encontrado"
      });
    }

    res.json({
      message: "Resultado KPI actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando resultado KPI",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteKpiResultado(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_KPI_RESULTADO
      WHERE KRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Resultado KPI no encontrado"
      });
    }

    res.json({
      message: "Resultado KPI eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando resultado KPI",
      error: error.message
    });
  }
}
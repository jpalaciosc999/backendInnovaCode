import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER RESULTADOS KPI
======================= */
export async function getKpiResultados(req, res) {
  try {
    const sql = `SELECT * FROM EMP_KPI_RESULTADO ORDER BY KRE_ID DESC`;

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
    const sql = `SELECT * FROM EMP_KPI_RESULTADO WHERE KRE_ID = :id`;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Resultado KPI no encontrado" });
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
    const { kre_monto_total, kre_calculo, kre_fecha, kpi_id, emp_id } = req.body;

    const sql = `
      INSERT INTO EMP_KPI_RESULTADO (
        KRE_ID,
        KRE_MONTO_TOTAL,
        KRE_CALCULO,
        KRE_FECHA,
        KPI_ID,
        EMP_ID
      ) VALUES (
        EMP_KRE_SEQ.NEXTVAL,
        :monto,
        :calculo,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        :kpi_id,
        :emp_id
      )
    `;

    await executeQuery(sql, {
      monto: Number(kre_monto_total),
      calculo: Number(kre_calculo),
      fecha: kre_fecha,
      kpi_id: Number(kpi_id),
      emp_id: Number(emp_id)
    });

    res.status(201).json({ message: "Resultado KPI creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando resultado KPI", error: error.message });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateKpiResultado(req, res) {
  try {
    const { id } = req.params;
    const { kre_monto_total, kre_calculo, kre_fecha, kpi_id, emp_id } = req.body;

    const sql = `
      UPDATE EMP_KPI_RESULTADO
      SET 
        KRE_MONTO_TOTAL = :monto,
        KRE_CALCULO = :calculo,
        KRE_FECHA = TO_DATE(:fecha, 'YYYY-MM-DD'),
        KPI_ID = :kpi_id,
        EMP_ID = :emp_id
      WHERE KRE_ID = :id
    `;

    await executeQuery(sql, {
      id: Number(id),
      monto: Number(kre_monto_total),
      calculo: Number(kre_calculo),
      fecha: kre_fecha,
      kpi_id: Number(kpi_id),
      emp_id: Number(emp_id)
    });

    res.json({ message: "Resultado KPI actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando resultado KPI", error: error.message });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteKpiResultado(req, res) {
  try {
    const { id } = req.params;
    const usado = await executeQuery(
      `
        SELECT 1
        FROM EMP_NOMINA_DETALLE
        WHERE KRE_ID = :id
          AND ROWNUM = 1
      `,
      { id: Number(id) }
    );

    if (usado.rows.length > 0) {
      return res.status(409).json({
        message: "No se puede eliminar el resultado KPI porque esta asociado a nomina"
      });
    }

    const sql = `DELETE FROM EMP_KPI_RESULTADO WHERE KRE_ID = :id`;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Resultado KPI no encontrado" });
    }

    res.json({ message: "Resultado KPI eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando resultado KPI", error: error.message });
  }
}

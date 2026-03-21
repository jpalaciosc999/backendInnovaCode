import { executeQuery } from "../../config/db.js";

export async function getEmpleadoContratos(req, res) {
  try {
    const sql = `
      SELECT
        TCO_ID, TCO_FECHA_INICIO, TCO_FECHA_FIN,
        TCO_ESTADO, TIC_FECHA_MODIFICACION, TIC_ID
      FROM EMPLEADO_CONTRATO
      ORDER BY TCO_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo empleado_contrato", error: error.message });
  }
}

export async function getEmpleadoContratoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        TCO_ID, TCO_FECHA_INICIO, TCO_FECHA_FIN,
        TCO_ESTADO, TIC_FECHA_MODIFICACION, TIC_ID
      FROM EMPLEADO_CONTRATO
      WHERE TCO_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Empleado contrato no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo empleado contrato", error: error.message });
  }
}

export async function createEmpleadoContrato(req, res) {
  try {
    const {
      tco_fecha_inicio,
      tco_fecha_fin,
      tco_estado,
      tic_fecha_modificacion,
      tic_id
    } = req.body;

    const sql = `
      INSERT INTO EMPLEADO_CONTRATO (
        TCO_ID, TCO_FECHA_INICIO, TCO_FECHA_FIN,
        TCO_ESTADO, TIC_FECHA_MODIFICACION, TIC_ID
      )
      VALUES (
        EMPLEADO_CONTRATO_SEQ.NEXTVAL,
        TO_DATE(:tco_fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:tco_fecha_fin, 'YYYY-MM-DD'),
        :tco_estado,
        TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'),
        :tic_id
      )
    `;

    await executeQuery(sql, {
      tco_fecha_inicio,
      tco_fecha_fin,
      tco_estado,
      tic_fecha_modificacion,
      tic_id
    });

    res.status(201).json({ message: "Empleado contrato creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando empleado contrato", error: error.message });
  }
}

export async function updateEmpleadoContrato(req, res) {
  try {
    const { id } = req.params;
    const {
      tco_fecha_inicio,
      tco_fecha_fin,
      tco_estado,
      tic_fecha_modificacion,
      tic_id
    } = req.body;

    const sql = `
      UPDATE EMPLEADO_CONTRATO
      SET
        TCO_FECHA_INICIO = TO_DATE(:tco_fecha_inicio, 'YYYY-MM-DD'),
        TCO_FECHA_FIN = TO_DATE(:tco_fecha_fin, 'YYYY-MM-DD'),
        TCO_ESTADO = :tco_estado,
        TIC_FECHA_MODIFICACION = TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'),
        TIC_ID = :tic_id
      WHERE TCO_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      tco_fecha_inicio,
      tco_fecha_fin,
      tco_estado,
      tic_fecha_modificacion,
      tic_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado contrato no encontrado" });
    }

    res.json({ message: "Empleado contrato actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando empleado contrato", error: error.message });
  }
}

export async function deleteEmpleadoContrato(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMPLEADO_CONTRATO
      WHERE TCO_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado contrato no encontrado" });
    }

    res.json({ message: "Empleado contrato eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando empleado contrato", error: error.message });
  }
}
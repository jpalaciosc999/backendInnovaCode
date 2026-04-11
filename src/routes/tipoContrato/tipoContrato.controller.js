import { executeQuery } from "../../config/db.js";

export async function getTiposContrato(req, res) {
  try {
    const sql = `
      SELECT
        TIC_ID, TIC_NOMBRE, TIC_NUMERO, TIC_DESCRIPCION,
        TIC_TIPO_JORNADA, TIC_FECHA_MODIFICACION, EMP_ID
      FROM EMP_TIPO_CONTRATO
      ORDER BY TIC_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo tipos de contrato", error: error.message });
  }
}

export async function getTipoContratoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        TIC_ID, TIC_NOMBRE, TIC_NUMERO, TIC_DESCRIPCION,
        TIC_TIPO_JORNADA, TIC_FECHA_MODIFICACION, EMP_ID
      FROM EMP_TIPO_CONTRATO
      WHERE TIC_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Tipo de contrato no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo tipo de contrato", error: error.message });
  }
}

export async function createTipoContrato(req, res) {
  try {
    const {
      tic_nombre,
      tic_numero,
      tic_descripcion,
      tic_tipo_jornada,
      tic_fecha_modificacion,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_TIPO_CONTRATO (
        TIC_ID, TIC_NOMBRE, TIC_NUMERO, TIC_DESCRIPCION,
        TIC_TIPO_JORNADA, TIC_FECHA_MODIFICACION, EMP_ID
      )
      VALUES (
        EMP_TIPO_CONTRATO_SEQ.NEXTVAL, :tic_nombre, :tic_numero, :tic_descripcion,
        :tic_tipo_jornada, TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'), :emp_id
      )
    `;

    await executeQuery(sql, {
      tic_nombre,
      tic_numero,
      tic_descripcion,
      tic_tipo_jornada,
      tic_fecha_modificacion,
      emp_id
    });

    res.status(201).json({ message: "Tipo de contrato creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando tipo de contrato", error: error.message });
  }
}

export async function updateTipoContrato(req, res) {
  try {
    const { id } = req.params;
    const {
      tic_nombre,
      tic_numero,
      tic_descripcion,
      tic_tipo_jornada,
      tic_fecha_modificacion,
      emp_id
    } = req.body;

    const sql = `
      UPDATE EMP_TIPO_CONTRATO
      SET
        TIC_NOMBRE = :tic_nombre,
        TIC_NUMERO = :tic_numero,
        TIC_DESCRIPCION = :tic_descripcion,
        TIC_TIPO_JORNADA = :tic_tipo_jornada,
        TIC_FECHA_MODIFICACION = TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'),
        EMP_ID = :emp_id
      WHERE TIC_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      tic_nombre,
      tic_numero,
      tic_descripcion,
      tic_tipo_jornada,
      tic_fecha_modificacion,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Tipo de contrato no encontrado" });
    }

    res.json({ message: "Tipo de contrato actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando tipo de contrato", error: error.message });
  }
}

export async function deleteTipoContrato(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_TIPO_CONTRATO
      WHERE TIC_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Tipo de contrato no encontrado" });
    }

    res.json({ message: "Tipo de contrato eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando tipo de contrato", error: error.message });
  }
}
import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER NOMINAS
======================= */
export async function getNominas(req, res) {
  try {
    const sql = `SELECT * FROM NOM_NOMINA`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo nominas",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getNominaById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_NOMINA
      WHERE NOM_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo nomina",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createNomina(req, res) {
  try {
    const {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_NOMINA (
        NOM_ID,
        NOM_TOTAL_INGRESOS,
        NOM_TOTAL_DESCUENTO,
        NOM_SALARIO_LIQUIDO,
        NOM_FECHA_GENERACION,
        PER_ID,
        EMP_ID,
        NOM_ESTADO
      ) VALUES (
        NOM_NOMINA_SEQ.NEXTVAL,
        :total_ingresos,
        :total_descuento,
        :salario_liquido,
        SYSDATE,
        :per_id,
        :emp_id,
        'A'
      )
    `;

    await executeQuery(sql, {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id
    });

    res.status(201).json({
      message: "Nomina creada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando nomina",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR NOMINA
======================= */
export async function updateNomina(req, res) {
  try {
    const { id } = req.params;
    const {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id,
      estado
    } = req.body;

    const sql = `
      UPDATE NOM_NOMINA
      SET
        NOM_TOTAL_INGRESOS = :total_ingresos,
        NOM_TOTAL_DESCUENTO = :total_descuento,
        NOM_SALARIO_LIQUIDO = :salario_liquido,
        PER_ID = :per_id,
        EMP_ID = :emp_id,
        NOM_ESTADO = :estado
      WHERE NOM_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id,
      estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json({ message: "Nomina actualizada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando nomina",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteNomina(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_NOMINA
      WHERE NOM_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json({
      message: "Nomina eliminada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando nomina",
      error: error.message
    });
  }
}
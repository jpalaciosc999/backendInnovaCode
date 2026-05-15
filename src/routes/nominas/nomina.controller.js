import { executeQuery } from "../../config/db.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeEstado(value) {
  return String(value || "B").trim().toUpperCase();
}

/* =======================
   OBTENER NOMINAS
======================= */
export async function getNominas(req, res) {
  try {
    const sql = `SELECT * FROM EMP_NOMINA`;

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
      SELECT * FROM EMP_NOMINA
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
      nom_total_ingresos,
      total_descuento,
      nom_total_descuento,
      salario_liquido,
      nom_salario_liquido,
      per_id,
      periodo_id,
      emp_id,
      empleado_id,
      liq_id,
      estado,
      nom_estado
    } = req.body;

    const payload = {
      total_ingresos: toNumberOrNull(firstDefined(total_ingresos, nom_total_ingresos)),
      total_descuento: toNumberOrNull(firstDefined(total_descuento, nom_total_descuento)),
      salario_liquido: toNumberOrNull(firstDefined(salario_liquido, nom_salario_liquido)),
      per_id: toNumberOrNull(firstDefined(per_id, periodo_id)),
      emp_id: toNumberOrNull(firstDefined(emp_id, empleado_id)),
      liq_id: toNumberOrNull(liq_id),
      estado: normalizeEstado(firstDefined(estado, nom_estado))
    };

    if (!payload.emp_id) {
      return res.status(400).json({
        message: "El empleado es obligatorio"
      });
    }

    const sql = `
      INSERT INTO EMP_NOMINA (
        NOM_ID,
        NOM_TOTAL_INGRESOS,
        NOM_TOTAL_DESCUENTO,
        NOM_SALARIO_LIQUIDO,
        NOM_FECHA_GENERACION,
        PER_ID,
        EMP_ID,
        LIQ_ID,
        NOM_ESTADO
      ) VALUES (
        SEQ_EMP_NOMINA.NEXTVAL,
        :total_ingresos,
        :total_descuento,
        :salario_liquido,
        SYSDATE,
        :per_id,
        :emp_id,
        :liq_id,
        :estado
      )
    `;

    await executeQuery(sql, payload);

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
      nom_total_ingresos,
      total_descuento,
      nom_total_descuento,
      salario_liquido,
      nom_salario_liquido,
      per_id,
      periodo_id,
      emp_id,
      empleado_id,
      liq_id,
      estado,
      nom_estado
    } = req.body;

    const payload = {
      id: Number(id),
      total_ingresos: toNumberOrNull(firstDefined(total_ingresos, nom_total_ingresos)),
      total_descuento: toNumberOrNull(firstDefined(total_descuento, nom_total_descuento)),
      salario_liquido: toNumberOrNull(firstDefined(salario_liquido, nom_salario_liquido)),
      per_id: toNumberOrNull(firstDefined(per_id, periodo_id)),
      emp_id: toNumberOrNull(firstDefined(emp_id, empleado_id)),
      liq_id: toNumberOrNull(liq_id),
      estado: normalizeEstado(firstDefined(estado, nom_estado))
    };

    if (!payload.emp_id) {
      return res.status(400).json({
        message: "El empleado es obligatorio"
      });
    }

    const sql = `
      UPDATE EMP_NOMINA
      SET
        NOM_TOTAL_INGRESOS = :total_ingresos,
        NOM_TOTAL_DESCUENTO = :total_descuento,
        NOM_SALARIO_LIQUIDO = :salario_liquido,
        PER_ID = :per_id,
        EMP_ID = :emp_id,
        LIQ_ID = :liq_id,
        NOM_ESTADO = :estado
      WHERE NOM_ID = :id
    `;

    const result = await executeQuery(sql, payload);

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
      DELETE FROM EMP_NOMINA
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

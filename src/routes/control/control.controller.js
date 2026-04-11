import { executeQuery } from "../../config/db.js";

export async function getControles(req, res) {
  try {
    const sql = `
      SELECT
        CTL_ID, CTL_FECHA_INICIO, CTL_FECHA_REGRESO, CTL_MOTIVO,
        CTL_HORAS, CTL_DESCRIPCION, CTL_ESTADO, CTL_FECHA_REGISTRO, EMP_ID
      FROM EMP_CONTROL_LABORAL
      ORDER BY CTL_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo controles", error: error.message });
  }
}

export async function getControlById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        CTL_ID, CTL_FECHA_INICIO, CTL_FECHA_REGRESO, CTL_MOTIVO,
        CTL_HORAS, CTL_DESCRIPCION, CTL_ESTADO, CTL_FECHA_REGISTRO, EMP_ID
      FROM EMP_CONTROL_LABORAL
      WHERE CTL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo control", error: error.message });
  }
}

export async function createControl(req, res) {
  try {
    const {
      ctl_fecha_inicio,
      ctl_fecha_regreso,
      ctl_motivo,
      ctl_horas,
      ctl_descripcion,
      ctl_estado,
      ctl_fecha_registro,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_CONTROL_LABORAL (
        CTL_ID, CTL_FECHA_INICIO, CTL_FECHA_REGRESO, CTL_MOTIVO,
        CTL_HORAS, CTL_DESCRIPCION, CTL_ESTADO, CTL_FECHA_REGISTRO, EMP_ID
      )
      VALUES (
        EMP_CONTROL_LABORAL_SEQ.NEXTVAL,
        TO_DATE(:ctl_fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:ctl_fecha_regreso, 'YYYY-MM-DD'),
        :ctl_motivo,
        :ctl_horas,
        :ctl_descripcion,
        :ctl_estado,
        TO_DATE(:ctl_fecha_registro, 'YYYY-MM-DD'),
        :emp_id
      )
    `;

    await executeQuery(sql, {
      ctl_fecha_inicio,
      ctl_fecha_regreso,
      ctl_motivo,
      ctl_horas,
      ctl_descripcion,
      ctl_estado,
      ctl_fecha_registro,
      emp_id
    });

    res.status(201).json({ message: "Control creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando control", error: error.message });
  }
}

export async function updateControl(req, res) {
  try {
    const { id } = req.params;
    const {
      ctl_fecha_inicio,
      ctl_fecha_regreso,
      ctl_motivo,
      ctl_horas,
      ctl_descripcion,
      ctl_estado,
      ctl_fecha_registro,
      emp_id
    } = req.body;

    const sql = `
      UPDATE EMP_CONTROL_LABORAL
      SET
        CTL_FECHA_INICIO = TO_DATE(:ctl_fecha_inicio, 'YYYY-MM-DD'),
        CTL_FECHA_REGRESO = TO_DATE(:ctl_fecha_regreso, 'YYYY-MM-DD'),
        CTL_MOTIVO = :ctl_motivo,
        CTL_HORAS = :ctl_horas,
        CTL_DESCRIPCION = :ctl_descripcion,
        CTL_ESTADO = :ctl_estado,
        CTL_FECHA_REGISTRO = TO_DATE(:ctl_fecha_registro, 'YYYY-MM-DD'),
        EMP_ID = :emp_id
      WHERE CTL_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      ctl_fecha_inicio,
      ctl_fecha_regreso,
      ctl_motivo,
      ctl_horas,
      ctl_descripcion,
      ctl_estado,
      ctl_fecha_registro,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    res.json({ message: "Control actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando control", error: error.message });
  }
}

export async function deleteControl(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_CONTROL_LABORAL
      WHERE CTL_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Control no encontrado" });
    }

    res.json({ message: "Control eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando control", error: error.message });
  }
}
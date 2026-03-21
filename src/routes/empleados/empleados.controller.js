import { executeQuery } from "../../config/db.js";

export async function getEmpleados(req, res) {
  try {
    const sql = `
      SELECT
        EMP_ID, EMP_NOMBRE, EMP_APELLIDO, EMP_DPI, EMP_NIT,
        EMP_TELEFONO, EMP_FECHA_CONTRATACION, EMP_ESTADO,
        TIC_ID, CUE_ID, PUE_ID, SED_ID
      FROM EMPLEADO
      ORDER BY EMP_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo empleados", error: error.message });
  }
}

export async function getEmpleadoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        EMP_ID, EMP_NOMBRE, EMP_APELLIDO, EMP_DPI, EMP_NIT,
        EMP_TELEFONO, EMP_FECHA_CONTRATACION, EMP_ESTADO,
        TIC_ID, CUE_ID, PUE_ID, SED_ID
      FROM EMPLEADO
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo empleado", error: error.message });
  }
}

export async function createEmpleado(req, res) {
  try {
    const {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_fecha_contratacion,
      emp_estado,
      tic_id,
      cue_id,
      pue_id,
      sed_id
    } = req.body;

    const sql = `
      INSERT INTO EMPLEADO (
        EMP_ID, EMP_NOMBRE, EMP_APELLIDO, EMP_DPI, EMP_NIT,
        EMP_TELEFONO, EMP_FECHA_CONTRATACION, EMP_ESTADO,
        TIC_ID, CUE_ID, PUE_ID, SED_ID
      )
      VALUES (
        EMPLEADO_SEQ.NEXTVAL, :emp_nombre, :emp_apellido, :emp_dpi, :emp_nit,
        :emp_telefono, TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'), :emp_estado,
        :tic_id, :cue_id, :pue_id, :sed_id
      )
    `;

    await executeQuery(sql, {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_fecha_contratacion,
      emp_estado,
      tic_id,
      cue_id,
      pue_id,
      sed_id
    });

    res.status(201).json({ message: "Empleado creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando empleado", error: error.message });
  }
}

export async function updateEmpleado(req, res) {
  try {
    const { id } = req.params;
    const {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_fecha_contratacion,
      emp_estado,
      tic_id,
      cue_id,
      pue_id,
      sed_id
    } = req.body;

    const sql = `
      UPDATE EMPLEADO
      SET
        EMP_NOMBRE = :emp_nombre,
        EMP_APELLIDO = :emp_apellido,
        EMP_DPI = :emp_dpi,
        EMP_NIT = :emp_nit,
        EMP_TELEFONO = :emp_telefono,
        EMP_FECHA_CONTRATACION = TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'),
        EMP_ESTADO = :emp_estado,
        TIC_ID = :tic_id,
        CUE_ID = :cue_id,
        PUE_ID = :pue_id,
        SED_ID = :sed_id
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_fecha_contratacion,
      emp_estado,
      tic_id,
      cue_id,
      pue_id,
      sed_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json({ message: "Empleado actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando empleado", error: error.message });
  }
}

export async function deleteEmpleado(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMPLEADO
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json({ message: "Empleado eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando empleado", error: error.message });
  }
}
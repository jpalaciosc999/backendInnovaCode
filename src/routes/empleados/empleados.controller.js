import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER EMPLEADOS
======================= */
export async function getEmpleados(req, res) {
  try {
    const sql = `
      SELECT 
        EMP_ID,
        EMP_NOMBRE,
        EMP_APELLIDO,
        EMP_DPI,
        EMP_NIT,
        EMP_TELEFONO,
        EMP_FECHA_CONTRATACION,
        EMP_ESTADO,
        DEP_ID,
        HOR_ID,
        TIC_ID,
        CUE_ID,
        PUE_ID,
        SED_ID,
        PRE_ID
      FROM EMP_EMPLEADO
      ORDER BY EMP_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo empleados",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getEmpleadoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        EMP_ID,
        EMP_NOMBRE,
        EMP_APELLIDO,
        EMP_DPI,
        EMP_NIT,
        EMP_TELEFONO,
        EMP_FECHA_CONTRATACION,
        EMP_ESTADO,
        DEP_ID,
        HOR_ID,
        TIC_ID,
        CUE_ID,
        PUE_ID,
        SED_ID,
        PRE_ID
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo empleado",
      error: error.message
    });
  }
}

/* =======================
   CREAR EMPLEADO
======================= */
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
      dep_id,
      hor_id,
      tic_id,
      cue_id,
      pue_id,
      sed_id,
      pre_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_EMPLEADO (
        EMP_ID,
        EMP_NOMBRE,
        EMP_APELLIDO,
        EMP_DPI,
        EMP_NIT,
        EMP_TELEFONO,
        EMP_FECHA_CONTRATACION,
        EMP_ESTADO,
        DEP_ID,
        HOR_ID,
        TIC_ID,
        CUE_ID,
        PUE_ID,
        SED_ID,
        PRE_ID
      )
      VALUES (
        EMP_EMPLEADO_SEQ.NEXTVAL,
        :emp_nombre,
        :emp_apellido,
        :emp_dpi,
        :emp_nit,
        :emp_telefono,
        TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'),
        :emp_estado,
        :dep_id,
        :hor_id,
        :tic_id,
        :cue_id,
        :pue_id,
        :sed_id,
        :pre_id
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
      dep_id: dep_id || null,
      hor_id: hor_id || null,
      tic_id: tic_id || null,
      cue_id: cue_id || null,
      pue_id: pue_id || null,
      sed_id: sed_id || null,
      pre_id: pre_id || null
    });

    res.status(201).json({ message: "Empleado creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando empleado",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR EMPLEADO
======================= */
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
      dep_id,
      hor_id,
      tic_id,
      cue_id,
      pue_id,
      sed_id,
      pre_id
    } = req.body;

    const sql = `
      UPDATE EMP_EMPLEADO
      SET
        EMP_NOMBRE = :emp_nombre,
        EMP_APELLIDO = :emp_apellido,
        EMP_DPI = :emp_dpi,
        EMP_NIT = :emp_nit,
        EMP_TELEFONO = :emp_telefono,
        EMP_FECHA_CONTRATACION = TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'),
        EMP_ESTADO = :emp_estado,
        DEP_ID = :dep_id,
        HOR_ID = :hor_id,
        TIC_ID = :tic_id,
        CUE_ID = :cue_id,
        PUE_ID = :pue_id,
        SED_ID = :sed_id,
        PRE_ID = :pre_id
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
      dep_id: dep_id || null,
      hor_id: hor_id || null,
      tic_id: tic_id || null,
      cue_id: cue_id || null,
      pue_id: pue_id || null,
      sed_id: sed_id || null,
      pre_id: pre_id || null
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json({ message: "Empleado actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando empleado",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR EMPLEADO
======================= */
export async function deleteEmpleado(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_EMPLEADO
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json({ message: "Empleado eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando empleado",
      error: error.message
    });
  }
}
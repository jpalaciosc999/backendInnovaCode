import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER DEPARTAMENTOS
======================= */
export async function getDepartamentos(req, res) {
  try {
    const sql = `
      SELECT
        DEP_ID,
        DEP_NOMBRE,
        DEP_DESCRIPCION,
        DEP_ESTADO,
        DEP_FECHA_CREACION,
        DEP_MODIFICACION
      FROM EMP_DEPARTAMENTO
      ORDER BY DEP_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo departamentos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getDepartamentoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_DEPARTAMENTO
      WHERE DEP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo departamento",
      error: error.message
    });
  }
}

/* =======================
   CREAR DEPARTAMENTO
======================= */
export async function createDepartamento(req, res) {
  try {
    // Se extraen los datos permitiendo variaciones en los nombres de las llaves
    const nombre = req.body.dep_nombre || req.body.nombre;
    const descripcion = req.body.dep_descripcion || req.body.descripcion;
    const estado = req.body.dep_estado || req.body.estado || 'A';

    // Validación preventiva para evitar el error ORA-01400 (NULL en DEP_NOMBRE)
    if (!nombre) {
      return res.status(400).json({
        message: "El nombre del departamento es obligatorio."
      });
    }

    const sql = `
      INSERT INTO EMP_DEPARTAMENTO (
        DEP_ID,
        DEP_NOMBRE,
        DEP_DESCRIPCION,
        DEP_ESTADO,
        DEP_FECHA_CREACION,
        DEP_MODIFICACION
      )
      VALUES (
        EMP_DEPARTAMENTO_SEQ.NEXTVAL,
        :nombre,
        :descripcion,
        :estado,
        SYSDATE,
        SYSDATE
      )
    `;

    await executeQuery(sql, {
      nombre: nombre,
      descripcion: descripcion || null,
      estado: estado
    });

    res.status(201).json({ message: "Departamento creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando departamento",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR DEPARTAMENTO
======================= */
export async function updateDepartamento(req, res) {
  try {
    const { id } = req.params;
    const nombre = req.body.dep_nombre || req.body.nombre;
    const descripcion = req.body.dep_descripcion || req.body.descripcion;
    const estado = req.body.dep_estado || req.body.estado;

    const sql = `
      UPDATE EMP_DEPARTAMENTO
      SET
        DEP_NOMBRE = :nombre,
        DEP_DESCRIPCION = :descripcion,
        DEP_ESTADO = :estado,
        DEP_MODIFICACION = SYSDATE
      WHERE DEP_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre: nombre,
      descripcion: descripcion,
      estado: estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    res.json({ message: "Departamento actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando departamento",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR DEPARTAMENTO
======================= */
export async function deleteDepartamento(req, res) {
  try {
    const { id } = req.params;
    const sql = `DELETE FROM EMP_DEPARTAMENTO WHERE DEP_ID = :id`;
    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    res.json({ message: "Departamento eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando departamento",
      error: error.message
    });
  }
}
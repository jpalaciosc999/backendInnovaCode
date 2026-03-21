import { executeQuery } from "../../config/db.js";

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
      FROM NOM_DEPARTAMENTO
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

export async function getDepartamentoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        DEP_ID,
        DEP_NOMBRE,
        DEP_DESCRIPCION,
        DEP_ESTADO,
        DEP_FECHA_CREACION,
        DEP_MODIFICACION
      FROM NOM_DEPARTAMENTO
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

export async function createDepartamento(req, res) {
  try {
    const {
      dep_nombre,
      dep_descripcion,
      dep_estado
    } = req.body;

    const sql = `
      INSERT INTO NOM_DEPARTAMENTO (
        DEP_ID,
        DEP_NOMBRE,
        DEP_DESCRIPCION,
        DEP_ESTADO,
        DEP_FECHA_CREACION,
        DEP_MODIFICACION
      )
      VALUES (
        NOM_DEPARTAMENTO_SEQ.NEXTVAL,
        :dep_nombre,
        :dep_descripcion,
        :dep_estado,
        SYSDATE,
        SYSDATE
      )
    `;

    await executeQuery(sql, {
      dep_nombre,
      dep_descripcion,
      dep_estado
    });

    res.status(201).json({ message: "Departamento creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando departamento",
      error: error.message
    });
  }
}

export async function updateDepartamento(req, res) {
  try {
    const { id } = req.params;
    const {
      dep_nombre,
      dep_descripcion,
      dep_estado
    } = req.body;

    const sql = `
      UPDATE NOM_DEPARTAMENTO
      SET
        DEP_NOMBRE = :dep_nombre,
        DEP_DESCRIPCION = :dep_descripcion,
        DEP_ESTADO = :dep_estado,
        DEP_MODIFICACION = SYSDATE
      WHERE DEP_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      dep_nombre,
      dep_descripcion,
      dep_estado
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

export async function deleteDepartamento(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_DEPARTAMENTO
      WHERE DEP_ID = :id
    `;

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
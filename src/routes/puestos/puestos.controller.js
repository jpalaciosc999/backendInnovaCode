import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER PUESTOS
======================= */
export async function getPuestos(req, res) {
  try {
    const sql = `SELECT * FROM NOM_PUESTO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo puestos",
      error: error.message
    });
  }
}

/* =======================
   JOIN PUESTO + DEPARTAMENTO
======================= */
export async function getPuestosConDepartamento(req, res) {
  try {
    const sql = `
      SELECT 
        P.PUE_ID,
        P.PUE_CODIGO,
        P.PUE_NOMBRE,
        D.DEP_NOMBRE,
        P.PUE_SALARIO_BASE
      FROM NOM_PUESTO P
      INNER JOIN NOM_DEPARTAMENTO D
        ON P.DEP_ID = D.DEP_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error en join puesto-departamento",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPuestoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_PUESTO
      WHERE PUE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Puesto no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo puesto",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createPuesto(req, res) {
  try {
    const {
      codigo,
      nombre,
      salario_base,
      descripcion,
      estado,
      dep_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_PUESTO (
        PUE_ID,
        PUE_CODIGO,
        PUE_NOMBRE,
        PUE_SALARIO_BASE,
        PUE_DESCRIPCION,
        PUE_ESTADO,
        PUE_FECHA_CREACION,
        DEP_ID
      ) VALUES (
        NOM_PUESTO_SEQ.NEXTVAL,
        :codigo,
        :nombre,
        :salario_base,
        :descripcion,
        :estado,
        SYSDATE,
        :dep_id
      )
    `;

    await executeQuery(sql, {
      codigo,
      nombre,
      salario_base,
      descripcion,
      estado,
      dep_id
    });

    res.status(201).json({
      message: "Puesto creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando puesto",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updatePuesto(req, res) {
  try {
    const { id } = req.params;
    const {
      codigo,
      nombre,
      salario_base,
      descripcion,
      estado,
      dep_id
    } = req.body;

    const sql = `
      UPDATE NOM_PUESTO
      SET 
        PUE_CODIGO = :codigo,
        PUE_NOMBRE = :nombre,
        PUE_SALARIO_BASE = :salario_base,
        PUE_DESCRIPCION = :descripcion,
        PUE_ESTADO = :estado,
        DEP_ID = :dep_id,
        PUE_FECHA_MODIFICACION = SYSDATE
      WHERE PUE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      codigo,
      nombre,
      salario_base,
      descripcion,
      estado,
      dep_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Puesto no encontrado"
      });
    }

    res.json({
      message: "Puesto actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando puesto",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR FÍSICO
======================= */
export async function deletePuesto(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_PUESTO
      WHERE PUE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    res.json({
      message: "Puesto eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando puesto",
      error: error.message
    });
  }
}

/* =======================
   BORRADO LÓGICO
======================= */
export async function deletePuestoLogico(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      UPDATE NOM_PUESTO
      SET PUE_ESTADO = 'I'
      WHERE PUE_ID = :id
    `;

    await executeQuery(sql, { id: Number(id) });

    res.json({
      message: "Puesto desactivado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error en borrado lógico",
      error: error.message
    });
  }
}
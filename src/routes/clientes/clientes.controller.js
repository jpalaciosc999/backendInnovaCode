import { executeQuery } from "../../config/db.js";

export async function getClientes(req, res) {
  try {
    const sql = `
SELECT ID, NOMBRE, CORREO
FROM HR.CLIENTES
ORDER BY ID
    `;

    const result = await executeQuery(sql);
console.log(result.rows);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo clientes",
      error: error.message
    });
  }
}

export async function getClienteById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT ID, NOMBRE, CORREO
      FROM CLIENTES
      WHERE ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Cliente no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo cliente",
      error: error.message
    });
  }
}

export async function createCliente(req, res) {
  try {
    const { nombre, correo } = req.body;

    if (!nombre || !correo) {
      return res.status(400).json({
        message: "Nombre y correo son obligatorios"
      });
    }

    const sql = `
      INSERT INTO CLIENTES (ID, NOMBRE, CORREO)
      VALUES (CLIENTES_SEQ.NEXTVAL, :nombre, :correo)
    `;

    await executeQuery(sql, { nombre, correo });

    res.status(201).json({
      message: "Cliente creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando cliente",
      error: error.message
    });
  }
}

export async function updateCliente(req, res) {
  try {
    const { id } = req.params;
    const { nombre, correo } = req.body;

    const sql = `
      UPDATE CLIENTES
      SET NOMBRE = :nombre,
          CORREO = :correo
      WHERE ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      nombre,
      correo
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Cliente no encontrado"
      });
    }

    res.json({
      message: "Cliente actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando cliente",
      error: error.message
    });
  }
}

export async function deleteCliente(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM CLIENTES
      WHERE ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Cliente no encontrado"
      });
    }

    res.json({
      message: "Cliente eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando cliente",
      error: error.message
    });
  }
}
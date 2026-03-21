import { executeQuery } from "../../config/db.js";

export async function getUsuarioBitacoras(req, res) {
  try {
    const sql = `
      SELECT USB_ID, USU_ID, BIT_ID
      FROM USUARIO_BITACORA
      ORDER BY USB_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo usuario_bitacora", error: error.message });
  }
}

export async function getUsuarioBitacoraById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT USB_ID, USU_ID, BIT_ID
      FROM USUARIO_BITACORA
      WHERE USB_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo registro", error: error.message });
  }
}

export async function createUsuarioBitacora(req, res) {
  try {
    const { usu_id, bit_id } = req.body;

    const sql = `
      INSERT INTO USUARIO_BITACORA (
        USB_ID, USU_ID, BIT_ID
      )
      VALUES (
        USUARIO_BITACORA_SEQ.NEXTVAL, :usu_id, :bit_id
      )
    `;

    await executeQuery(sql, { usu_id, bit_id });

    res.status(201).json({ message: "Registro creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando registro", error: error.message });
  }
}

export async function updateUsuarioBitacora(req, res) {
  try {
    const { id } = req.params;
    const { usu_id, bit_id } = req.body;

    const sql = `
      UPDATE USUARIO_BITACORA
      SET
        USU_ID = :usu_id,
        BIT_ID = :bit_id
      WHERE USB_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      usu_id,
      bit_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json({ message: "Registro actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando registro", error: error.message });
  }
}

export async function deleteUsuarioBitacora(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM USUARIO_BITACORA
      WHERE USB_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json({ message: "Registro eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando registro", error: error.message });
  }
}
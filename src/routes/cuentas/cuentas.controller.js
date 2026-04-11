import { executeQuery } from "../../config/db.js";

export async function getCuentas(req, res) {
  try {
    const sql = `
      SELECT CUE_ID, BAN_NOMBRE, CUE_NUMERO, CUE_TIPO, EMP_ID
      FROM  EMP_CUENTA_BANCARIA
      ORDER BY CUE_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo cuentas", error: error.message });
  }
}

export async function getCuentaById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT CUE_ID, BAN_NOMBRE, CUE_NUMERO, CUE_TIPO, EMP_ID
      FROM  EMP_CUENTA_BANCARIA
      WHERE CUE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo cuenta", error: error.message });
  }
}

export async function createCuenta(req, res) {
  try {
    const { ban_nombre, cue_numero, cue_tipo, emp_id } = req.body;

    const sql = `
      INSERT INTO  EMP_CUENTA_BANCARIA (
        CUE_ID, BAN_NOMBRE, CUE_NUMERO, CUE_TIPO, EMP_ID
      )
      VALUES (
        EMP_CUENTA_BANCARIA_SEQ.NEXTVAL, :ban_nombre, :cue_numero, :cue_tipo, :emp_id
      )
    `;

    await executeQuery(sql, { ban_nombre, cue_numero, cue_tipo, emp_id });

    res.status(201).json({ message: "Cuenta creada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando cuenta", error: error.message });
  }
}

export async function updateCuenta(req, res) {
  try {
    const { id } = req.params;
    const { ban_nombre, cue_numero, cue_tipo, emp_id } = req.body;

    const sql = `
      UPDATE  EMP_CUENTA_BANCARIA
      SET
        BAN_NOMBRE = :ban_nombre,
        CUE_NUMERO = :cue_numero,
        CUE_TIPO = :cue_tipo,
        EMP_ID = :emp_id
      WHERE CUE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      ban_nombre,
      cue_numero,
      cue_tipo,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    res.json({ message: "Cuenta actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando cuenta", error: error.message });
  }
}

export async function deleteCuenta(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM  EMP_CUENTA_BANCARIA
      WHERE CUE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    res.json({ message: "Cuenta eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando cuenta", error: error.message });
  }
}
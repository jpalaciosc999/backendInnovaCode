import { executeQuery } from "../../config/db.js";

export async function getSedes(req, res) {
  try {
    const sql = `
      SELECT SED_ID, SED_NOMBRE, SED_TELEFONO, SED_DEPARTAMENTO, SED_MUNICIPIO, SED_ZONA
      FROM SEDE
      ORDER BY SED_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo sedes", error: error.message });
  }
}

export async function getSedeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT SED_ID, SED_NOMBRE, SED_TELEFONO, SED_DEPARTAMENTO, SED_MUNICIPIO, SED_ZONA
      FROM SEDE
      WHERE SED_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Sede no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo sede", error: error.message });
  }
}

export async function createSede(req, res) {
  try {
    const { sed_nombre, sed_telefono, sed_departamento, sed_municipio, sed_zona } = req.body;

    const sql = `
      INSERT INTO SEDE (
        SED_ID, SED_NOMBRE, SED_TELEFONO, SED_DEPARTAMENTO, SED_MUNICIPIO, SED_ZONA
      )
      VALUES (
        SEDE_SEQ.NEXTVAL, :sed_nombre, :sed_telefono, :sed_departamento, :sed_municipio, :sed_zona
      )
    `;

    await executeQuery(sql, {
      sed_nombre,
      sed_telefono,
      sed_departamento,
      sed_municipio,
      sed_zona
    });

    res.status(201).json({ message: "Sede creada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando sede", error: error.message });
  }
}

export async function updateSede(req, res) {
  try {
    const { id } = req.params;
    const { sed_nombre, sed_telefono, sed_departamento, sed_municipio, sed_zona } = req.body;

    const sql = `
      UPDATE SEDE
      SET
        SED_NOMBRE = :sed_nombre,
        SED_TELEFONO = :sed_telefono,
        SED_DEPARTAMENTO = :sed_departamento,
        SED_MUNICIPIO = :sed_municipio,
        SED_ZONA = :sed_zona
      WHERE SED_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      sed_nombre,
      sed_telefono,
      sed_departamento,
      sed_municipio,
      sed_zona
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Sede no encontrada" });
    }

    res.json({ message: "Sede actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando sede", error: error.message });
  }
}

export async function deleteSede(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM SEDE
      WHERE SED_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Sede no encontrada" });
    }

    res.json({ message: "Sede eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando sede", error: error.message });
  }
}
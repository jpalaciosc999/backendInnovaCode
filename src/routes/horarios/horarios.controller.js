import { executeQuery } from "../../config/db.js";

/* =======================
   VALIDACIONES
======================= */
function esHoraValida(hora) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(hora);
}

function validarDias(payload) {
  const dias = [
    payload.hor_lunes,
    payload.hor_martes,
    payload.hor_miercoles,
    payload.hor_jueves,
    payload.hor_viernes,
    payload.hor_sabado,
    payload.hor_domingo
  ];

  return dias.every((dia) => dia === 0 || dia === 1 || dia === undefined || dia === null);
}

function normalizarDias(payload) {
  return {
    hor_lunes: payload.hor_lunes ?? 0,
    hor_martes: payload.hor_martes ?? 0,
    hor_miercoles: payload.hor_miercoles ?? 0,
    hor_jueves: payload.hor_jueves ?? 0,
    hor_viernes: payload.hor_viernes ?? 0,
    hor_sabado: payload.hor_sabado ?? 0,
    hor_domingo: payload.hor_domingo ?? 0
  };
}

export async function getHorarios(req, res) {
  try {
    const sql = `
      SELECT
        HOR_ID,
        HOR_DESCRIPCION,
        HOR_HORA_INICIO,
        HOR_HORA_FIN,
        HOR_LUNES,
        HOR_MARTES,
        HOR_MIERCOLES,
        HOR_JUEVES,
        HOR_VIERNES,
        HOR_SABADO,
        HOR_DOMINGO
      FROM EMP_HORARIO
      ORDER BY HOR_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo horarios",
      error: error.message
    });
  }
}

export async function getHorarioById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        HOR_ID,
        HOR_DESCRIPCION,
        HOR_HORA_INICIO,
        HOR_HORA_FIN,
        HOR_LUNES,
        HOR_MARTES,
        HOR_MIERCOLES,
        HOR_JUEVES,
        HOR_VIERNES,
        HOR_SABADO,
        HOR_DOMINGO
      FROM EMP_HORARIO
      WHERE HOR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo horario",
      error: error.message
    });
  }
}

export async function createHorario(req, res) {
  try {
    const {
      hor_descripcion,
      hor_hora_inicio,
      hor_hora_fin,
      hor_lunes,
      hor_martes,
      hor_miercoles,
      hor_jueves,
      hor_viernes,
      hor_sabado,
      hor_domingo
    } = req.body;

    if (!hor_descripcion?.trim() || !hor_hora_inicio || !hor_hora_fin) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "La descripción, hora inicio y hora fin son obligatorias"
      });
    }

    if (!esHoraValida(hor_hora_inicio) || !esHoraValida(hor_hora_fin)) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "El formato de hora debe ser HH:MM"
      });
    }

    if (!validarDias(req.body)) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "Los días solo pueden tener valores 0 o 1"
      });
    }

    const dias = normalizarDias(req.body);

    const sql = `
      INSERT INTO EMP_HORARIO (
        HOR_DESCRIPCION,
        HOR_HORA_INICIO,
        HOR_HORA_FIN,
        HOR_LUNES,
        HOR_MARTES,
        HOR_MIERCOLES,
        HOR_JUEVES,
        HOR_VIERNES,
        HOR_SABADO,
        HOR_DOMINGO
      )
      VALUES (
        :hor_descripcion,
        :hor_hora_inicio,
        :hor_hora_fin,
        :hor_lunes,
        :hor_martes,
        :hor_miercoles,
        :hor_jueves,
        :hor_viernes,
        :hor_sabado,
        :hor_domingo
      )
    `;

    await executeQuery(sql, {
      hor_descripcion: hor_descripcion.trim(),
      hor_hora_inicio,
      hor_hora_fin,
      ...dias
    });

    res.status(201).json({ message: "Horario creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando horario",
      error: error.message
    });
  }
}

export async function updateHorario(req, res) {
  try {
    const { id } = req.params;
    const {
      hor_descripcion,
      hor_hora_inicio,
      hor_hora_fin
    } = req.body;

    if (!hor_descripcion?.trim() || !hor_hora_inicio || !hor_hora_fin) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "La descripción, hora inicio y hora fin son obligatorias"
      });
    }

    if (!esHoraValida(hor_hora_inicio) || !esHoraValida(hor_hora_fin)) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "El formato de hora debe ser HH:MM"
      });
    }

    if (!validarDias(req.body)) {
      return res.status(400).json({
        message: "Datos inválidos",
        error: "Los días solo pueden tener valores 0 o 1"
      });
    }

    const dias = normalizarDias(req.body);

    const sql = `
      UPDATE EMP_HORARIO
      SET
        HOR_DESCRIPCION = :hor_descripcion,
        HOR_HORA_INICIO = :hor_hora_inicio,
        HOR_HORA_FIN = :hor_hora_fin,
        HOR_LUNES = :hor_lunes,
        HOR_MARTES = :hor_martes,
        HOR_MIERCOLES = :hor_miercoles,
        HOR_JUEVES = :hor_jueves,
        HOR_VIERNES = :hor_viernes,
        HOR_SABADO = :hor_sabado,
        HOR_DOMINGO = :hor_domingo
      WHERE HOR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      hor_descripcion: hor_descripcion.trim(),
      hor_hora_inicio,
      hor_hora_fin,
      ...dias
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }

    res.json({ message: "Horario actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando horario",
      error: error.message
    });
  }
}

export async function deleteHorario(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_HORARIO
      WHERE HOR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }

    res.json({ message: "Horario eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando horario",
      error: error.message
    });
  }
}
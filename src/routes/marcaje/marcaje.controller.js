import { executeQuery } from "../../config/db.js";

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isEmpleado(req) {
  return normalizeRole(req.usuario?.rol_nombre) === "empleado";
}

function puedeOperarEmpleado(req, empId) {
  if (!isEmpleado(req)) return true;
  return Number(req.usuario?.emp_id) === Number(empId);
}

function parseHoraMinutos(value) {
  const [hours = "0", minutes = "0"] = String(value || "").split(":");
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function minutosActuales() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getDiaHorarioColumn(date = new Date()) {
  return [
    "HOR_DOMINGO",
    "HOR_LUNES",
    "HOR_MARTES",
    "HOR_MIERCOLES",
    "HOR_JUEVES",
    "HOR_VIERNES",
    "HOR_SABADO"
  ][date.getDay()];
}

async function getHorarioEmpleado(empId) {
  const result = await executeQuery(
    `
      SELECT
        e.EMP_ID,
        e.HOR_ID,
        h.HOR_DESCRIPCION,
        h.HOR_HORA_INICIO,
        h.HOR_HORA_FIN,
        h.HOR_LUNES,
        h.HOR_MARTES,
        h.HOR_MIERCOLES,
        h.HOR_JUEVES,
        h.HOR_VIERNES,
        h.HOR_SABADO,
        h.HOR_DOMINGO
      FROM EMP_EMPLEADO e
      LEFT JOIN EMP_HORARIO h ON h.HOR_ID = e.HOR_ID
      WHERE e.EMP_ID = :emp_id
    `,
    { emp_id: Number(empId) }
  );

  return result.rows[0] || null;
}

function validarDiaLaboral(horario) {
  if (!horario?.HOR_ID) {
    return "No tienes un horario asignado. Contacta a RRHH antes de marcar.";
  }

  const dia = getDiaHorarioColumn();
  if (Number(horario[dia] || 0) !== 1) {
    return "Hoy no tienes jornada asignada en tu horario.";
  }

  return null;
}

function validarEntradaEmpleado(horario) {
  const errorDia = validarDiaLaboral(horario);
  if (errorDia) return errorDia;

  const inicio = parseHoraMinutos(horario.HOR_HORA_INICIO);
  const ahora = minutosActuales();
  const inicioVentana = inicio - 60;
  const finVentana = inicio + 120;

  if (ahora < inicioVentana) {
    return "Aun es muy temprano para registrar entrada. Puedes marcar hasta 60 minutos antes de tu horario.";
  }

  if (ahora > finVentana) {
    return "La ventana para registrar entrada ya paso. Contacta a tu supervisor.";
  }

  return null;
}

function validarSalidaEmpleado(horario, entrada) {
  const errorDia = validarDiaLaboral(horario);
  if (errorDia) return errorDia;

  const ahoraDate = new Date();
  const entradaDate = new Date(entrada);
  const minutosDesdeEntrada = (ahoraDate.getTime() - entradaDate.getTime()) / 60000;

  if (minutosDesdeEntrada < 30) {
    return "No puedes registrar salida tan pronto. Deben pasar al menos 30 minutos desde tu entrada.";
  }

  const fin = parseHoraMinutos(horario.HOR_HORA_FIN);
  const ahora = minutosActuales();
  const inicioVentanaSalida = fin - 30;
  const finVentanaSalida = fin + 120;

  if (ahora < inicioVentanaSalida) {
    return "Aun es muy temprano para registrar salida. Puedes marcar desde 30 minutos antes de tu hora de salida.";
  }

  if (ahora > finVentanaSalida) {
    return "La ventana para registrar salida ya paso. Contacta a tu supervisor.";
  }

  return null;
}

// LISTAR MARCAJES
export async function getMarcajes(req, res) {
  try {
    const sql = `
      SELECT 
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_AUTORIZACION,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      ORDER BY M.MAR_FECHA DESC, M.MAR_ID DESC
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    console.error("Error en getMarcajes:", error);
    res.status(500).json({
      message: "Error obteniendo marcajes",
      error: error.message
    });
  }
}

// OBTENER MARCAJE POR ID
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_AUTORIZACION,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      WHERE M.MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en getMarcajeById:", error);
    res.status(500).json({
      message: "Error obteniendo marcaje",
      error: error.message
    });
  }
}

// CREAR MARCAJE MANUAL
export async function createMarcaje(req, res) {
  try {
    const { emp_id, fecha, entrada, salida, autorizacion = 0 } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes registrar marcajes para tu propio empleado" });
    }

    const horarioEmpleado = isEmpleado(req) ? await getHorarioEmpleado(emp_id) : null;

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        EMP_ID,
        MAR_AUTORIZACION
      )
      VALUES (
        EMP_MARCAJE_SEQ.NEXTVAL,
        NVL(TO_DATE(:fecha, 'YYYY-MM-DD'), TRUNC(SYSDATE)),
        TO_DATE(:entrada, 'YYYY-MM-DD HH24:MI:SS'),
        TO_DATE(:salida, 'YYYY-MM-DD HH24:MI:SS'),
        :emp_id,
        :autorizacion
      )
    `;

    await executeQuery(sql, {
      emp_id: Number(emp_id),
      fecha: fecha || null,
      entrada: entrada || null,
      salida: salida || null,
      autorizacion: Number(autorizacion)
    });

    res.status(201).json({ message: "Marcaje creado correctamente" });
  } catch (error) {
    console.error("Error en createMarcaje:", error);
    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

// REGISTRAR ENTRADA O SALIDA AUTOMÁTICA
export async function registrarMarcaje(req, res) {
  try {
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes registrar marcajes para tu propio empleado" });
    }

    const sqlCheck = `
      SELECT MAR_ID, MAR_ENTRADA, MAR_SALIDA
      FROM EMP_MARCAJE
      WHERE EMP_ID = :emp_id
      AND TRUNC(MAR_FECHA) = TRUNC(SYSDATE)
    `;

    const checkResult = await executeQuery(sqlCheck, {
      emp_id: Number(emp_id)
    });

    if (checkResult.rows.length === 0) {
      const errorEntrada = horarioEmpleado ? validarEntradaEmpleado(horarioEmpleado) : null;
      if (errorEntrada) {
        return res.status(400).json({ message: errorEntrada });
      }

      const sqlInsert = `
        INSERT INTO EMP_MARCAJE (
          MAR_ID,
          MAR_FECHA,
          MAR_ENTRADA,
          EMP_ID,
          MAR_AUTORIZACION
        )
        VALUES (
          EMP_MARCAJE_SEQ.NEXTVAL,
          TRUNC(SYSDATE),
          SYSDATE,
          :emp_id,
          0
        )
      `;

      await executeQuery(sqlInsert, {
        emp_id: Number(emp_id)
      });

      return res.status(201).json({
        message: "Entrada registrada con éxito"
      });
    }

    const registro = checkResult.rows[0];

    if (!registro.MAR_SALIDA) {
      const errorSalida = horarioEmpleado ? validarSalidaEmpleado(horarioEmpleado, registro.MAR_ENTRADA) : null;
      if (errorSalida) {
        return res.status(400).json({ message: errorSalida });
      }

      const sqlUpdate = `
        UPDATE EMP_MARCAJE
        SET MAR_SALIDA = SYSDATE
        WHERE MAR_ID = :id
      `;

      await executeQuery(sqlUpdate, {
        id: registro.MAR_ID
      });

      return res.json({
        message: "Salida registrada con éxito"
      });
    }

    return res.status(400).json({
      message: "Ya has completado tu jornada de hoy"
    });
  } catch (error) {
    console.error("Error en registrarMarcaje:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
}

// HISTORIAL POR EMPLEADO
export async function getHistorial(req, res) {
  try {
    const { emp_id, offset = 0 } = req.query;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes consultar tu propio historial de marcajes" });
    }

    const sql = `
      SELECT *
      FROM (
        SELECT 
          M.MAR_ID,
          M.MAR_FECHA,
          M.MAR_ENTRADA,
          M.MAR_SALIDA,
          M.MAR_AUTORIZACION,
          E.EMP_NOMBRE,
          E.EMP_APELLIDO
        FROM EMP_MARCAJE M
        JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
        WHERE M.EMP_ID = :emp_id
        ORDER BY M.MAR_FECHA DESC
      )
      OFFSET :offset ROWS FETCH NEXT 15 ROWS ONLY
    `;

    const result = await executeQuery(sql, {
      emp_id: Number(emp_id),
      offset: Number(offset)
    });

    res.json(result.rows);
  } catch (error) {
    console.error("Error en getHistorial:", error);
    res.status(500).json({
      message: "Error obteniendo historial",
      error: error.message
    });
  }
}

// ACTUALIZAR AUTORIZACIÓN
export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const { autorizacion } = req.body;

    if (isEmpleado(req)) {
      return res.status(403).json({ message: "No puedes autorizar marcajes desde un usuario empleado" });
    }

    if (![1, 2].includes(Number(autorizacion))) {
      return res.status(400).json({
        message: "La autorización debe ser 1 para autorizar o 2 para rechazar"
      });
    }

    const existe = await executeQuery(
      `SELECT MAR_ID FROM EMP_MARCAJE WHERE MAR_ID = :id`,
      { id: Number(id) }
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    const sqlUpdate = `
      UPDATE EMP_MARCAJE
      SET MAR_AUTORIZACION = :autorizacion
      WHERE MAR_ID = :id
    `;

    await executeQuery(sqlUpdate, {
      autorizacion: Number(autorizacion),
      id: Number(id)
    });

    res.json({ message: "Marcaje actualizado correctamente" });
  } catch (error) {
    console.error("Error en updateMarcaje:", error);
    res.status(500).json({
      message: "Error actualizando marcaje",
      error: error.message
    });
  }
}

// ELIMINAR MARCAJE
export async function deleteMarcaje(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_MARCAJE
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({ message: "Marcaje eliminado correctamente" });
  } catch (error) {
    console.error("Error en deleteMarcaje:", error);
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}

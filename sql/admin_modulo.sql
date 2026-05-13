/* =========================================================
   ADMIN - seguridad, integridad y catalogo base para nominas

   Este script deja el modulo administrativo con reglas y datos
   iniciales mas cercanos a un sistema real de nominas:
   - Roles funcionales
   - Permisos por modulo operativo
   - Asignaciones idempotentes rol-permiso
   - Reglas de integridad para evitar duplicados
   ========================================================= */

/* =========================================================
   Limpieza previa conservadora de datos historicos

   Mantiene el ID menor como registro principal. Esto permite
   crear reglas unicas sin perder las relaciones existentes.
   ========================================================= */

/* Normalizar niveles antiguos de roles que estaban guardados como texto. */
UPDATE EMP_ROLES
SET ROL_NIVEL_ACCESO = CASE UPPER(TRIM(TO_CHAR(ROL_NIVEL_ACCESO)))
  WHEN 'SUPERALTO' THEN '1'
  WHEN 'ALTO' THEN '5'
  WHEN 'INTERMEDIO-ALTO' THEN '10'
  WHEN 'INTERMEDIO' THEN '20'
  WHEN 'BAJO' THEN '90'
  ELSE ROL_NIVEL_ACCESO
END
WHERE UPPER(TRIM(TO_CHAR(ROL_NIVEL_ACCESO))) IN (
  'SUPERALTO',
  'ALTO',
  'INTERMEDIO-ALTO',
  'INTERMEDIO',
  'BAJO'
);

/* Consolidar permisos duplicados antes de crear el indice unico. */
DELETE FROM EMP_ROL_PERMISOS rp
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT
      p.PERMISOS_ID AS permiso_duplicado,
      MIN(p.PERMISOS_ID) OVER (
        PARTITION BY LOWER(p.PER_MODULO), LOWER(p.PER_NOMBRE_PERMISO)
      ) AS permiso_principal
    FROM EMP_PERMISOS p
  ) dup
  WHERE dup.permiso_duplicado = rp.PER_ID
    AND dup.permiso_duplicado <> dup.permiso_principal
    AND EXISTS (
      SELECT 1
      FROM EMP_ROL_PERMISOS rp_principal
      WHERE rp_principal.ROL_ID = rp.ROL_ID
        AND rp_principal.PER_ID = dup.permiso_principal
    )
);

UPDATE EMP_ROL_PERMISOS rp
SET rp.PER_ID = (
  SELECT permiso_principal
  FROM (
    SELECT
      p.PERMISOS_ID AS permiso_duplicado,
      MIN(p.PERMISOS_ID) OVER (
        PARTITION BY LOWER(p.PER_MODULO), LOWER(p.PER_NOMBRE_PERMISO)
      ) AS permiso_principal
    FROM EMP_PERMISOS p
  ) dup
  WHERE dup.permiso_duplicado = rp.PER_ID
)
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT
      p.PERMISOS_ID AS permiso_duplicado,
      MIN(p.PERMISOS_ID) OVER (
        PARTITION BY LOWER(p.PER_MODULO), LOWER(p.PER_NOMBRE_PERMISO)
      ) AS permiso_principal
    FROM EMP_PERMISOS p
  ) dup
  WHERE dup.permiso_duplicado = rp.PER_ID
    AND dup.permiso_duplicado <> dup.permiso_principal
);

DELETE FROM EMP_ROL_PERMISOS rp
WHERE rp.ROWID NOT IN (
  SELECT MIN(rp2.ROWID)
  FROM EMP_ROL_PERMISOS rp2
  GROUP BY rp2.ROL_ID, rp2.PER_ID
);

DELETE FROM EMP_PERMISOS p
WHERE p.PERMISOS_ID NOT IN (
  SELECT MIN(p2.PERMISOS_ID)
  FROM EMP_PERMISOS p2
  GROUP BY LOWER(p2.PER_MODULO), LOWER(p2.PER_NOMBRE_PERMISO)
);

/* Consolidar relaciones usuario-bitacora duplicadas. */
DELETE FROM EMP_USUARIO_BITACORA ub
WHERE ub.ROWID NOT IN (
  SELECT MIN(ub2.ROWID)
  FROM EMP_USUARIO_BITACORA ub2
  GROUP BY ub2.USU_ID, ub2.BIT_ID
);

/* Usuarios: evitar duplicados reales de login/correo. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_USUARIO_USERNAME ON EMP_USUARIO (LOWER(USU_USERNAME))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20001, 'UQ_USUARIO_USERNAME no se creo porque existen usuarios duplicados.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_USUARIO_CORREO ON EMP_USUARIO (LOWER(USU_CORREO))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20002, 'UQ_USUARIO_CORREO no se creo porque existen correos duplicados.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EMP_USUARIO ADD CONSTRAINT CK_USUARIO_ESTADO CHECK (USU_ESTADO IN (''A'', ''I''))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -2264 THEN RAISE; END IF;
END;
/

/* Roles: estado valido, nivel de acceso y nombre unico. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_ROLES_NOMBRE ON EMP_ROLES (LOWER(ROL_NOMBRE))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20003, 'UQ_ROLES_NOMBRE no se creo porque existen roles duplicados.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EMP_ROLES ADD CONSTRAINT CK_ROLES_ESTADO CHECK (ROL_ESTADO IN (''A'', ''I''))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -2264 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE EMP_ROLES ADD CONSTRAINT CK_ROLES_NIVEL CHECK (REGEXP_LIKE(TRIM(TO_CHAR(ROL_NIVEL_ACCESO)), ''^[0-9]+$'')) ENABLE NOVALIDATE';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -2264 THEN RAISE; END IF;
END;
/

/* Permisos: no duplicar permiso dentro del mismo modulo. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_PERMISOS_MODULO_NOMBRE ON EMP_PERMISOS (LOWER(PER_MODULO), LOWER(PER_NOMBRE_PERMISO))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20004, 'UQ_PERMISOS_MODULO_NOMBRE no se creo porque existen permisos duplicados.');
    ELSE
      RAISE;
    END IF;
END;
/

/* Rol-permisos: una asignacion por rol y permiso. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_ROL_PERMISOS_ROL_PER ON EMP_ROL_PERMISOS (ROL_ID, PER_ID)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20005, 'UQ_ROL_PERMISOS_ROL_PER no se creo porque existen asignaciones rol-permiso duplicadas.');
    ELSE
      RAISE;
    END IF;
END;
/

/* Usuario-bitacora: una relacion por usuario y bitacora. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_USUARIO_BITACORA ON EMP_USUARIO_BITACORA (USU_ID, BIT_ID)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL;
    ELSIF SQLCODE = -1452 THEN
      RAISE_APPLICATION_ERROR(-20006, 'UQ_USUARIO_BITACORA no se creo porque existen relaciones usuario-bitacora duplicadas.');
    ELSE
      RAISE;
    END IF;
END;
/

/* Indices para consultas administrativas de auditoria. */
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IX_BITACORA_FECHA_ID ON EMP_BITACORA (BIT_FECHA DESC, BIT_ID DESC)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IX_BITACORA_ACCION ON EMP_BITACORA (UPPER(BIT_ACCION))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IX_BITACORA_TABLA ON EMP_BITACORA (UPPER(BIT_TABLA_AFECTADA))';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IX_USUARIO_BITACORA_BIT ON EMP_USUARIO_BITACORA (BIT_ID, USU_ID)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

/* =========================================================
   Roles base del sistema de nominas
   ========================================================= */
MERGE INTO EMP_ROLES dst
USING (
  SELECT 'Administrador Nomina' AS nombre, 'Control total del sistema, seguridad, parametros y auditoria.' AS descripcion, 1 AS nivel FROM DUAL UNION ALL
  SELECT 'Gerente RRHH', 'Gestion de empleados, contratos, periodos y supervision de nomina.', 10 FROM DUAL UNION ALL
  SELECT 'Analista Nomina', 'Calculo, revision y preparacion de planillas de pago.', 20 FROM DUAL UNION ALL
  SELECT 'Supervisor Asistencia', 'Validacion de marcajes, horarios, permisos laborales y suspensiones.', 30 FROM DUAL UNION ALL
  SELECT 'Contabilidad', 'Consulta de reportes, liquidaciones, prestamos y totales de pago.', 40 FROM DUAL UNION ALL
  SELECT 'Consulta Auditoria', 'Acceso de solo lectura a bitacora, reportes y trazabilidad.', 90 FROM DUAL
) src
ON (LOWER(dst.ROL_NOMBRE) = LOWER(src.nombre))
WHEN MATCHED THEN UPDATE SET
  dst.ROL_DESCRIPCION = src.descripcion,
  dst.ROL_NIVEL_ACCESO = src.nivel,
  dst.ROL_ESTADO = 'A'
WHEN NOT MATCHED THEN INSERT (
  ROL_ID,
  ROL_NOMBRE,
  ROL_DESCRIPCION,
  ROL_NIVEL_ACCESO,
  ROL_ESTADO,
  ROL_FECHA_CREACION
) VALUES (
  EMP_ROLES_SEQ.NEXTVAL,
  src.nombre,
  src.descripcion,
  src.nivel,
  'A',
  SYSDATE
);

/* =========================================================
   Permisos base por modulo
   ========================================================= */
MERGE INTO EMP_PERMISOS dst
USING (
  SELECT 'ADMIN' modulo, 'Gestionar usuarios' permiso, 'Crear, actualizar e inactivar usuarios del sistema.' descripcion FROM DUAL UNION ALL
  SELECT 'ADMIN', 'Gestionar roles', 'Administrar roles y niveles de acceso.' FROM DUAL UNION ALL
  SELECT 'ADMIN', 'Gestionar permisos', 'Asignar permisos por rol y modulo.' FROM DUAL UNION ALL
  SELECT 'ADMIN', 'Ver bitacora', 'Consultar trazabilidad y actividad administrativa.' FROM DUAL UNION ALL
  SELECT 'EMPLEADOS', 'Gestionar empleados', 'Crear y mantener expedientes de empleados.' FROM DUAL UNION ALL
  SELECT 'EMPLEADOS', 'Consultar empleados', 'Consultar expedientes y datos laborales.' FROM DUAL UNION ALL
  SELECT 'CONTRATOS', 'Gestionar contratos', 'Registrar cambios de contrato, vigencia y tipo de relacion laboral.' FROM DUAL UNION ALL
  SELECT 'ASISTENCIA', 'Gestionar horarios', 'Configurar jornadas, horarios y controles laborales.' FROM DUAL UNION ALL
  SELECT 'ASISTENCIA', 'Validar marcajes', 'Revisar entradas, salidas, ausencias y excepciones.' FROM DUAL UNION ALL
  SELECT 'ASISTENCIA', 'Gestionar suspensiones IGSS', 'Registrar suspensiones y periodos cubiertos por IGSS.' FROM DUAL UNION ALL
  SELECT 'NOMINA', 'Generar nomina', 'Crear planillas por periodo y empleado.' FROM DUAL UNION ALL
  SELECT 'NOMINA', 'Aprobar nomina', 'Cerrar y aprobar planillas listas para pago.' FROM DUAL UNION ALL
  SELECT 'NOMINA', 'Consultar nomina', 'Consultar encabezados y detalle de planilla.' FROM DUAL UNION ALL
  SELECT 'PERIODOS', 'Gestionar periodos', 'Abrir, cerrar y administrar periodos de pago.' FROM DUAL UNION ALL
  SELECT 'INGRESOS', 'Gestionar ingresos', 'Registrar bonos, comisiones, horas extra y otros ingresos.' FROM DUAL UNION ALL
  SELECT 'DESCUENTOS', 'Gestionar descuentos', 'Registrar descuentos, retenciones y deducciones.' FROM DUAL UNION ALL
  SELECT 'PRESTAMOS', 'Gestionar prestamos', 'Registrar prestamos, cuotas y saldos pendientes.' FROM DUAL UNION ALL
  SELECT 'LIQUIDACIONES', 'Gestionar liquidaciones', 'Preparar liquidaciones laborales y calculos finales.' FROM DUAL UNION ALL
  SELECT 'REPORTES', 'Ver reportes gerenciales', 'Consultar indicadores, totales y reportes de nomina.' FROM DUAL
) src
ON (
  LOWER(dst.PER_MODULO) = LOWER(src.modulo)
  AND LOWER(dst.PER_NOMBRE_PERMISO) = LOWER(src.permiso)
)
WHEN MATCHED THEN UPDATE SET
  dst.PER_DESCRIPCION = src.descripcion
WHEN NOT MATCHED THEN INSERT (
  PERMISOS_ID,
  PER_NOMBRE_PERMISO,
  PER_MODULO,
  PER_DESCRIPCION
) VALUES (
  EMP_PERMISOS_SEQ.NEXTVAL,
  src.permiso,
  src.modulo,
  src.descripcion
);

/* Administrador: acceso total. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  CROSS JOIN EMP_PERMISOS p
  WHERE r.ROL_NOMBRE = 'Administrador Nomina'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

/* RRHH: administracion laboral y supervision de nomina. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  INNER JOIN EMP_PERMISOS p
    ON p.PER_MODULO IN ('EMPLEADOS', 'CONTRATOS', 'ASISTENCIA', 'PERIODOS', 'NOMINA', 'REPORTES')
  WHERE r.ROL_NOMBRE = 'Gerente RRHH'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

/* Analista de nomina: operacion de planillas, ingresos y descuentos. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  INNER JOIN EMP_PERMISOS p
    ON p.PER_MODULO IN ('EMPLEADOS', 'NOMINA', 'PERIODOS', 'INGRESOS', 'DESCUENTOS', 'PRESTAMOS', 'LIQUIDACIONES', 'REPORTES')
  WHERE r.ROL_NOMBRE = 'Analista Nomina'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

/* Supervisor de asistencia: jornadas, marcajes y suspensiones. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  INNER JOIN EMP_PERMISOS p
    ON p.PER_MODULO IN ('EMPLEADOS', 'ASISTENCIA', 'REPORTES')
  WHERE r.ROL_NOMBRE = 'Supervisor Asistencia'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

/* Contabilidad: consulta de resultados y procesos de pago. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  INNER JOIN EMP_PERMISOS p
    ON p.PER_MODULO IN ('NOMINA', 'PRESTAMOS', 'LIQUIDACIONES', 'REPORTES')
  WHERE r.ROL_NOMBRE = 'Contabilidad'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

/* Auditoria: trazabilidad y lectura. */
MERGE INTO EMP_ROL_PERMISOS dst
USING (
  SELECT r.ROL_ID, p.PERMISOS_ID AS PER_ID
  FROM EMP_ROLES r
  INNER JOIN EMP_PERMISOS p
    ON p.PER_MODULO IN ('ADMIN', 'REPORTES')
   AND p.PER_NOMBRE_PERMISO IN ('Ver bitacora', 'Ver reportes gerenciales')
  WHERE r.ROL_NOMBRE = 'Consulta Auditoria'
) src
ON (dst.ROL_ID = src.ROL_ID AND dst.PER_ID = src.PER_ID)
WHEN NOT MATCHED THEN INSERT (RPE_ID, PER_ID, ROL_ID)
VALUES (EMP_ROL_PERMISOS_SEQ.NEXTVAL, src.PER_ID, src.ROL_ID);

COMMIT;

/* =========================================================
   Diagnostico opcional de datos existentes

   Si algun indice unico aviso duplicados, ejecuta estas consultas
   para revisar que registros debes consolidar antes de volver a
   crear la regla unica.
   ========================================================= */

SELECT
  ROL_ID,
  ROL_NOMBRE,
  ROL_NIVEL_ACCESO
FROM EMP_ROLES
WHERE NOT REGEXP_LIKE(TRIM(TO_CHAR(ROL_NIVEL_ACCESO)), '^[0-9]+$')
   OR LENGTH(TRIM(TO_CHAR(ROL_NIVEL_ACCESO))) > 2;

SELECT
  LOWER(USU_USERNAME) AS USUARIO,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_USUARIO
GROUP BY LOWER(USU_USERNAME)
HAVING COUNT(*) > 1;

SELECT
  LOWER(USU_CORREO) AS CORREO,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_USUARIO
GROUP BY LOWER(USU_CORREO)
HAVING COUNT(*) > 1;

SELECT
  LOWER(ROL_NOMBRE) AS ROL,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_ROLES
GROUP BY LOWER(ROL_NOMBRE)
HAVING COUNT(*) > 1;

SELECT
  LOWER(PER_MODULO) AS MODULO,
  LOWER(PER_NOMBRE_PERMISO) AS PERMISO,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_PERMISOS
GROUP BY LOWER(PER_MODULO), LOWER(PER_NOMBRE_PERMISO)
HAVING COUNT(*) > 1;

SELECT
  ROL_ID,
  PER_ID,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_ROL_PERMISOS
GROUP BY ROL_ID, PER_ID
HAVING COUNT(*) > 1;

SELECT
  USU_ID,
  BIT_ID,
  COUNT(*) AS TOTAL_DUPLICADOS
FROM EMP_USUARIO_BITACORA
GROUP BY USU_ID, BIT_ID
HAVING COUNT(*) > 1;

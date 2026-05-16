-- ============================================================================
-- Datos de prueba y reporteria para RRHH / Nomina
-- Oracle SQL
--
-- Rango de datos: 2026-01-01 al 2026-05-15
-- Orden de ejecucion:
--   1. Preparacion de secuencias
--   2. Limpieza de datos operativos/transaccionales
--   3. Catalogos base necesarios
--   4. Empleados, contratos, cuentas y prestamos
--   5. Periodos, marcajes, asignaciones, KPI y nominas calculadas
--   6. Consultas de verificacion
--
-- Nota importante:
--   Este script elimina datos operativos de RRHH/nomina. No elimina usuarios,
--   roles, permisos ni relaciones de seguridad. Los catalogos esenciales se
--   conservan y se completan con MERGE.
-- ============================================================================

SET SERVEROUTPUT ON;
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK;

-- ============================================================================
-- 1. Preparacion de secuencias usadas por los inserts
-- ============================================================================

DECLARE
  PROCEDURE CREATE_SEQUENCE_IF_MISSING(
    p_sequence_name IN VARCHAR2,
    p_table_name IN VARCHAR2,
    p_pk_name IN VARCHAR2
  ) AS
    v_count NUMBER;
    v_start NUMBER := 1;
  BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM USER_SEQUENCES
    WHERE SEQUENCE_NAME = UPPER(p_sequence_name);

    IF v_count > 0 THEN
      DBMS_OUTPUT.PUT_LINE('Sequence ' || p_sequence_name || ' ya existe.');
      RETURN;
    END IF;

    BEGIN
      EXECUTE IMMEDIATE
        'SELECT NVL(MAX(' || p_pk_name || '), 0) + 1 FROM ' || p_table_name
        INTO v_start;
    EXCEPTION
      WHEN OTHERS THEN
        v_start := 1;
    END;

    IF v_start < 1 THEN
      v_start := 1;
    END IF;

    EXECUTE IMMEDIATE
      'CREATE SEQUENCE ' || p_sequence_name ||
      ' START WITH ' || v_start ||
      ' INCREMENT BY 1 NOCACHE NOCYCLE';

    DBMS_OUTPUT.PUT_LINE('Sequence ' || p_sequence_name || ' creado.');
  END;
BEGIN
  CREATE_SEQUENCE_IF_MISSING('EMP_DEPARTAMENTO_SEQ', 'EMP_DEPARTAMENTO', 'DEP_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_PUESTO_SEQ', 'EMP_PUESTO', 'PUE_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_EMP_SEDE', 'EMP_SEDE', 'SED_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_HORARIO_SEQ', 'EMP_HORARIO', 'HOR_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_TIPO_CONTRATO', 'EMP_TIPO_CONTRATO', 'TIC_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_INGRESO_SEQ', 'EMP_INGRESO', 'TIS_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_DESCUENTO_SEQ', 'EMP_DESCUENTO', 'TDS_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_PERIODO_SEQ', 'EMP_PERIODO', 'PER_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_EMPLEADO_SEQ', 'EMP_EMPLEADO', 'EMP_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_CONTRATO', 'EMP_EMPLEADO_CONTRATO', 'TCO_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_CUENTA_BANCARIA_SEQ', 'EMP_CUENTA_BANCARIA', 'CUE_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_MARCAJE_SEQ', 'EMP_MARCAJE', 'MAR_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_KPI_SEQ', 'EMP_KPI', 'KPI_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_KRE_SEQ', 'EMP_KPI_RESULTADO', 'KRE_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_EMP_NOMINA_ASIGNACION', 'EMP_NOMINA_ASIGNACION', 'NAS_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_NOMINA_SEQ', 'EMP_NOMINA', 'NOM_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_NOMINA_DETALLE_SEQ', 'EMP_NOMINA_DETALLE', 'DET_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_PRESTAMO_SEQ', 'EMP_PRESTAMO', 'PRE_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_EMP_PRESTAMO_DETALLE', 'EMP_PRESTAMO_DETALLE', 'PDE_ID');
  CREATE_SEQUENCE_IF_MISSING('SEQ_BITACORA', 'EMP_BITACORA', 'BIT_ID');
  CREATE_SEQUENCE_IF_MISSING('EMP_USUARIO_BITACORA_SEQ', 'EMP_USUARIO_BITACORA', 'USB_ID');
END;
/

-- ============================================================================
-- 2. Limpieza de datos operativos/transaccionales
--    Se preservan usuarios, roles, permisos y catalogos esenciales.
-- ============================================================================

DECLARE
  PROCEDURE safe_exec(p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignora tablas opcionales que no existan en alguna instalacion.
      IF SQLCODE != -942 THEN
        RAISE;
      END IF;
  END;
BEGIN
  safe_exec('DELETE FROM EMP_MI_TIENDITA');
  safe_exec('DELETE FROM EMP_CALCULADORA_IGSS');

  DELETE FROM EMP_PRESTAMO_DETALLE;
  DELETE FROM EMP_NOMINA_DETALLE;
  DELETE FROM EMP_NOMINA;
  DELETE FROM EMP_NOMINA_ASIGNACION;
  DELETE FROM EMP_KPI_RESULTADO;
  DELETE FROM EMP_MARCAJE;
  DELETE FROM EMP_CONTROL_LABORAL;
  DELETE FROM EMP_SUSPENSION_IGSS;
  DELETE FROM EMP_LIQUIDACIONES;
  DELETE FROM EMP_CUENTA_BANCARIA;
  DELETE FROM EMP_EMPLEADO_CONTRATO;

  -- Los usuarios base se conservan; solo se suelta la referencia operativa.
  UPDATE EMP_USUARIO SET EMP_ID = NULL WHERE EMP_ID IS NOT NULL;
  UPDATE EMP_TIPO_CONTRATO SET EMP_ID = NULL WHERE EMP_ID IS NOT NULL;

  DELETE FROM EMP_EMPLEADO;
  DELETE FROM EMP_PRESTAMO;
  DELETE FROM EMP_PERIODO;
  DELETE FROM EMP_KPI;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Limpieza operativa completada.');
END;
/

-- ============================================================================
-- 3. Catalogos base: conceptos de ingreso/descuento, departamentos, puestos,
--    sedes, horarios y tipo de contrato.
-- ============================================================================

MERGE INTO EMP_INGRESO t
USING (
  SELECT 'SALARIO' codigo, 'Salario base' nombre, 'Salario ordinario del empleado' descripcion, 0 valor, 'N' recurrente FROM DUAL UNION ALL
  SELECT 'BONIF-INC', 'Bonificacion incentivo', 'Bonificacion Decreto 37-2001', 250, 'N' FROM DUAL UNION ALL
  SELECT 'HORA-EXTRA', 'Horas extra', 'Sueldo extraordinario calculado desde marcajes autorizados', 0, 'N' FROM DUAL UNION ALL
  SELECT 'COMISION', 'Comision / KPI', 'Comisiones y montos generados por KPI', 0, 'N' FROM DUAL UNION ALL
  SELECT 'OTRO-ING', 'Otros ingresos', 'Ingresos variables no clasificados', 0, 'N' FROM DUAL
) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN MATCHED THEN
  UPDATE SET
    t.TIS_NOMBRE = s.nombre,
    t.TIS_DESCRIPCION = s.descripcion,
    t.TIS_VALOR_BASE = s.valor,
    t.TIS_ES_RECURRENTE = s.recurrente,
    t.TIS_FECHA_MODIFICACION = SYSDATE
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, TIS_FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (
  SELECT 'IGSS-LAB' codigo, 'IGSS laboral' nombre, 'Cuota laboral IGSS calculada automaticamente' descripcion, 'PORCENTAJE' tipo, 0 valor, 4.83 porcentaje, 'S' obligatorio, 'A' estado FROM DUAL UNION ALL
  SELECT 'ISR', 'ISR', 'ISR calculado automaticamente segun base salarial', 'PORCENTAJE', 0, 0, 'S', 'A' FROM DUAL UNION ALL
  SELECT 'PRESTAMO', 'Prestamo', 'Cuota de prestamo del empleado', 'FIJO', 0, 0, 'N', 'A' FROM DUAL UNION ALL
  SELECT 'ANTICIPO', 'Anticipo de nomina', 'Anticipo de salario asignado al periodo', 'FIJO', 0, 0, 'N', 'A' FROM DUAL UNION ALL
  SELECT 'JUDICIAL', 'Descuento judicial', 'Pension alimenticia, embargo u otro descuento judicial', 'FIJO', 0, 0, 'N', 'A' FROM DUAL UNION ALL
  SELECT 'OTRO-EGR', 'Otros egresos', 'Parqueo u otros descuentos variables', 'FIJO', 0, 0, 'N', 'A' FROM DUAL
) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN MATCHED THEN
  UPDATE SET
    t.TDS_NOMBRE = s.nombre,
    t.TDS_DESCRIPCION = s.descripcion,
    t.TDS_TIPO_CALCULO = s.tipo,
    t.TDS_VALOR_BASE = s.valor,
    t.TDS_PORCENTAJE = s.porcentaje,
    t.TDS_ES_OBLIGATORIO = s.obligatorio,
    t.TDS_ESTADO = s.estado,
    t.TDS_MODIFICACION = SYSDATE
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DEPARTAMENTO t
USING (
  SELECT 'ADMINISTRACION' nombre, 'Administracion general' descripcion FROM DUAL UNION ALL
  SELECT 'PRODUCCION', 'Operacion y bodega' FROM DUAL UNION ALL
  SELECT 'VENTAS', 'Equipo comercial' FROM DUAL UNION ALL
  SELECT 'CONTABILIDAD', 'Finanzas y nomina' FROM DUAL
) s
ON (UPPER(t.DEP_NOMBRE) = s.nombre)
WHEN MATCHED THEN
  UPDATE SET t.DEP_DESCRIPCION = s.descripcion, t.DEP_ESTADO = 'A', t.DEP_MODIFICACION = SYSDATE
WHEN NOT MATCHED THEN
  INSERT (DEP_ID, DEP_NOMBRE, DEP_DESCRIPCION, DEP_ESTADO, DEP_FECHA_CREACION)
  VALUES (EMP_DEPARTAMENTO_SEQ.NEXTVAL, s.nombre, s.descripcion, 'A', SYSDATE);

MERGE INTO EMP_SEDE t
USING (
  SELECT 'Central Zona 10' nombre, 22223333 telefono, 'Guatemala' departamento, 'Guatemala' municipio, '10' zona FROM DUAL
) s
ON (UPPER(t.SED_NOMBRE) = UPPER(s.nombre))
WHEN MATCHED THEN
  UPDATE SET t.SED_TELEFONO = s.telefono, t.SED_DEPARTAMENTO = s.departamento, t.SED_MUNICIPIO = s.municipio, t.SED_ZONA = s.zona
WHEN NOT MATCHED THEN
  INSERT (SED_ID, SED_NOMBRE, SED_TELEFONO, SED_DEPARTAMENTO, SED_MUNICIPIO, SED_ZONA)
  VALUES (SEQ_EMP_SEDE.NEXTVAL, s.nombre, s.telefono, s.departamento, s.municipio, s.zona);

MERGE INTO EMP_HORARIO t
USING (
  SELECT 'Lunes a Viernes 08:00-17:00' descripcion, '08:00' hora_inicio, '17:00' hora_fin FROM DUAL
) s
ON (UPPER(t.HOR_DESCRIPCION) = UPPER(s.descripcion))
WHEN MATCHED THEN
  UPDATE SET
    t.HOR_HORA_INICIO = s.hora_inicio,
    t.HOR_HORA_FIN = s.hora_fin,
    t.HOR_LUNES = 1,
    t.HOR_MARTES = 1,
    t.HOR_MIERCOLES = 1,
    t.HOR_JUEVES = 1,
    t.HOR_VIERNES = 1,
    t.HOR_SABADO = 0,
    t.HOR_DOMINGO = 0
WHEN NOT MATCHED THEN
  INSERT (
    HOR_ID, HOR_DESCRIPCION, HOR_HORA_INICIO, HOR_HORA_FIN,
    HOR_LUNES, HOR_MARTES, HOR_MIERCOLES, HOR_JUEVES, HOR_VIERNES, HOR_SABADO, HOR_DOMINGO
  )
  VALUES (
    EMP_HORARIO_SEQ.NEXTVAL, s.descripcion, s.hora_inicio, s.hora_fin,
    1, 1, 1, 1, 1, 0, 0
  );

MERGE INTO EMP_TIPO_CONTRATO t
USING (
  SELECT 'Contrato indefinido' nombre, 'TIC-IND' numero, 'Contrato laboral indefinido' descripcion, 'Tiempo completo' jornada FROM DUAL
) s
ON (UPPER(t.TIC_NUMERO) = UPPER(s.numero))
WHEN MATCHED THEN
  UPDATE SET
    t.TIC_NOMBRE = s.nombre,
    t.TIC_DESCRIPCION = s.descripcion,
    t.TIC_TIPO_JORNADA = s.jornada,
    t.TIC_FECHA_MODIFICACION = SYSDATE
WHEN NOT MATCHED THEN
  INSERT (TIC_ID, TIC_NOMBRE, TIC_NUMERO, TIC_DESCRIPCION, TIC_TIPO_JORNADA, TIC_FECHA_MODIFICACION)
  VALUES (SEQ_TIPO_CONTRATO.NEXTVAL, s.nombre, s.numero, s.descripcion, s.jornada, SYSDATE);

-- Puestos por departamento.
DECLARE
  v_dep_admin NUMBER;
  v_dep_prod NUMBER;
  v_dep_ventas NUMBER;
  v_dep_conta NUMBER;
BEGIN
  SELECT DEP_ID INTO v_dep_admin FROM EMP_DEPARTAMENTO WHERE UPPER(DEP_NOMBRE) = 'ADMINISTRACION' FETCH FIRST 1 ROWS ONLY;
  SELECT DEP_ID INTO v_dep_prod FROM EMP_DEPARTAMENTO WHERE UPPER(DEP_NOMBRE) = 'PRODUCCION' FETCH FIRST 1 ROWS ONLY;
  SELECT DEP_ID INTO v_dep_ventas FROM EMP_DEPARTAMENTO WHERE UPPER(DEP_NOMBRE) = 'VENTAS' FETCH FIRST 1 ROWS ONLY;
  SELECT DEP_ID INTO v_dep_conta FROM EMP_DEPARTAMENTO WHERE UPPER(DEP_NOMBRE) = 'CONTABILIDAD' FETCH FIRST 1 ROWS ONLY;

  MERGE INTO EMP_PUESTO t
  USING (
    SELECT 'PUE-ADM-SUP' codigo, 'Supervisora administrativa' nombre, 5000 salario, 'Supervision administrativa' descripcion, v_dep_admin dep_id FROM DUAL UNION ALL
    SELECT 'PUE-ADM-AUX', 'Auxiliar administrativo', 4000, 'Auxiliar administrativo', v_dep_admin FROM DUAL UNION ALL
    SELECT 'PUE-BOD-ASIS', 'Asistente de bodega', 4000, 'Operacion de bodega', v_dep_prod FROM DUAL UNION ALL
    SELECT 'PUE-BOD-JEFE', 'Jefe de bodega', 8500, 'Coordinacion de bodega', v_dep_prod FROM DUAL UNION ALL
    SELECT 'PUE-VEN-ASE', 'Asesor comercial', 10000, 'Ventas y cartera', v_dep_ventas FROM DUAL UNION ALL
    SELECT 'PUE-VEN-ASIS', 'Asistente de ventas', 7600, 'Soporte comercial', v_dep_ventas FROM DUAL UNION ALL
    SELECT 'PUE-CON-AUX', 'Auxiliar contable', 4500, 'Contabilidad operativa', v_dep_conta FROM DUAL UNION ALL
    SELECT 'PUE-CON-NOM', 'Analista de nomina', 12000, 'Procesamiento de nomina', v_dep_conta FROM DUAL
  ) s
  ON (UPPER(t.PUE_CODIGO) = s.codigo)
  WHEN MATCHED THEN
    UPDATE SET
      t.PUE_NOMBRE = s.nombre,
      t.PUE_SALARIO_BASE = s.salario,
      t.PUE_DESCRIPCION = s.descripcion,
      t.PUE_ESTADO = 'A',
      t.PUE_FECHA_MODIFICACION = SYSDATE,
      t.DEP_ID = s.dep_id
  WHEN NOT MATCHED THEN
    INSERT (PUE_ID, PUE_CODIGO, PUE_NOMBRE, PUE_SALARIO_BASE, PUE_DESCRIPCION, PUE_ESTADO, PUE_FECHA_CREACION, DEP_ID)
    VALUES (EMP_PUESTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.salario, s.descripcion, 'A', SYSDATE, s.dep_id);
END;
/

COMMIT;

-- ============================================================================
-- 4. Insercion de datos operativos: periodos, empleados, contratos, cuentas,
--    prestamos, marcajes, KPI, asignaciones y nominas.
-- ============================================================================

DECLARE
  TYPE t_num_tab IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  TYPE t_vc_tab IS TABLE OF VARCHAR2(100) INDEX BY PLS_INTEGER;

  v_emp_ids t_num_tab;
  v_emp_nombre t_vc_tab;
  v_emp_apellido t_vc_tab;
  v_emp_puesto_codigo t_vc_tab;

  v_tic_id NUMBER;
  v_sed_id NUMBER;
  v_hor_id NUMBER;

  v_tis_salario NUMBER;
  v_tis_bonif NUMBER;
  v_tis_extra NUMBER;
  v_tis_comision NUMBER;
  v_tis_otro NUMBER;

  v_tds_igss NUMBER;
  v_tds_isr NUMBER;
  v_tds_prestamo NUMBER;
  v_tds_anticipo NUMBER;
  v_tds_judicial NUMBER;
  v_tds_otro NUMBER;

  v_per_id NUMBER;
  v_nom_id NUMBER;
  v_pre_id NUMBER;
  v_kpi_ventas NUMBER;
  v_kpi_meta NUMBER;
  v_fecha DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_period_pay DATE;
  v_factor NUMBER;
  v_salary NUMBER;
  v_salary_period NUMBER;
  v_bonus_period NUMBER;
  v_pue_id NUMBER;
  v_dep_id NUMBER;
  v_extra_hours NUMBER;
  v_extra_amount NUMBER;
  v_kpi_amount NUMBER;
  v_other_income NUMBER;
  v_anticipo NUMBER;
  v_judicial NUMBER;
  v_other_discount NUMBER;
  v_loan_payment NUMBER;
  v_total_ing NUMBER;
  v_total_desc NUMBER;
  v_liquido NUMBER;
  v_estado CHAR(1);
  v_saldo NUMBER;

  FUNCTION get_dep_id(p_nombre VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT DEP_ID INTO v_id
    FROM EMP_DEPARTAMENTO
    WHERE UPPER(DEP_NOMBRE) = UPPER(p_nombre)
    FETCH FIRST 1 ROWS ONLY;
    RETURN v_id;
  END;

  FUNCTION get_pue_id(p_codigo VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT PUE_ID INTO v_id
    FROM EMP_PUESTO
    WHERE UPPER(PUE_CODIGO) = UPPER(p_codigo)
    FETCH FIRST 1 ROWS ONLY;
    RETURN v_id;
  END;

  FUNCTION get_pue_salary(p_codigo VARCHAR2) RETURN NUMBER IS
    v_sal NUMBER;
  BEGIN
    SELECT NVL(PUE_SALARIO_BASE, 0) INTO v_sal
    FROM EMP_PUESTO
    WHERE UPPER(PUE_CODIGO) = UPPER(p_codigo)
    FETCH FIRST 1 ROWS ONLY;
    RETURN v_sal;
  END;

  FUNCTION get_ingreso_id(p_codigo VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT TIS_ID INTO v_id
    FROM EMP_INGRESO
    WHERE UPPER(TIS_CODIGO) = UPPER(p_codigo)
    FETCH FIRST 1 ROWS ONLY;
    RETURN v_id;
  END;

  FUNCTION get_descuento_id(p_codigo VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT TDS_ID INTO v_id
    FROM EMP_DESCUENTO
    WHERE UPPER(TDS_CODIGO) = UPPER(p_codigo)
    FETCH FIRST 1 ROWS ONLY;
    RETURN v_id;
  END;

  FUNCTION calc_isr_mensual(p_salario_mensual NUMBER) RETURN NUMBER IS
    v_renta_anual NUMBER := GREATEST(NVL(p_salario_mensual, 0), 0) * 12;
    v_renta_imponible NUMBER;
  BEGIN
    v_renta_imponible := GREATEST(0, v_renta_anual - 48000 - 60000);

    IF v_renta_imponible <= 0 THEN
      RETURN 0;
    ELSIF v_renta_imponible <= 300000 THEN
      RETURN ROUND((v_renta_imponible * 0.05) / 12, 2);
    ELSE
      RETURN ROUND((15000 + (v_renta_imponible - 300000) * 0.07) / 12, 2);
    END IF;
  END;

  PROCEDURE add_nom_det(
    p_ref NUMBER,
    p_monto NUMBER,
    p_tis_id NUMBER,
    p_tds_id NUMBER,
    p_kre_id NUMBER
  ) IS
  BEGIN
    IF NVL(p_monto, 0) > 0 THEN
      INSERT INTO EMP_NOMINA_DETALLE (
        DET_ID, DET_REFERENCIA, DET_MONTO, NOM_ID, TIS_ID, TDS_ID, KRE_ID
      ) VALUES (
        EMP_NOMINA_DETALLE_SEQ.NEXTVAL, p_ref, ROUND(p_monto, 2), v_nom_id, p_tis_id, p_tds_id, p_kre_id
      );
    END IF;
  END;

BEGIN
  SELECT TIC_ID INTO v_tic_id FROM EMP_TIPO_CONTRATO WHERE UPPER(TIC_NUMERO) = 'TIC-IND' FETCH FIRST 1 ROWS ONLY;
  SELECT SED_ID INTO v_sed_id FROM EMP_SEDE WHERE UPPER(SED_NOMBRE) = UPPER('Central Zona 10') FETCH FIRST 1 ROWS ONLY;
  SELECT HOR_ID INTO v_hor_id FROM EMP_HORARIO WHERE UPPER(HOR_DESCRIPCION) = UPPER('Lunes a Viernes 08:00-17:00') FETCH FIRST 1 ROWS ONLY;

  v_tis_salario := get_ingreso_id('SALARIO');
  v_tis_bonif := get_ingreso_id('BONIF-INC');
  v_tis_extra := get_ingreso_id('HORA-EXTRA');
  v_tis_comision := get_ingreso_id('COMISION');
  v_tis_otro := get_ingreso_id('OTRO-ING');

  v_tds_igss := get_descuento_id('IGSS-LAB');
  v_tds_isr := get_descuento_id('ISR');
  v_tds_prestamo := get_descuento_id('PRESTAMO');
  v_tds_anticipo := get_descuento_id('ANTICIPO');
  v_tds_judicial := get_descuento_id('JUDICIAL');
  v_tds_otro := get_descuento_id('OTRO-EGR');

  -- Periodos validos: mensuales y quincenal final.
  INSERT INTO EMP_PERIODO (PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO, PER_ESTADO)
  VALUES (EMP_PERIODO_SEQ.NEXTVAL, DATE '2026-01-01', DATE '2026-01-31', DATE '2026-01-31', 'A');
  INSERT INTO EMP_PERIODO (PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO, PER_ESTADO)
  VALUES (EMP_PERIODO_SEQ.NEXTVAL, DATE '2026-02-01', DATE '2026-02-28', DATE '2026-02-28', 'A');
  INSERT INTO EMP_PERIODO (PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO, PER_ESTADO)
  VALUES (EMP_PERIODO_SEQ.NEXTVAL, DATE '2026-03-01', DATE '2026-03-31', DATE '2026-03-31', 'A');
  INSERT INTO EMP_PERIODO (PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO, PER_ESTADO)
  VALUES (EMP_PERIODO_SEQ.NEXTVAL, DATE '2026-04-01', DATE '2026-04-30', DATE '2026-04-30', 'A');
  INSERT INTO EMP_PERIODO (PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO, PER_ESTADO)
  VALUES (EMP_PERIODO_SEQ.NEXTVAL, DATE '2026-05-01', DATE '2026-05-15', DATE '2026-05-15', 'A');

  -- Empleados realistas, repartidos por departamento y puesto.
  v_emp_nombre(1) := 'Ana';       v_emp_apellido(1) := 'Lopez Garcia';      v_emp_puesto_codigo(1) := 'PUE-ADM-SUP';
  v_emp_nombre(2) := 'Dulce';     v_emp_apellido(2) := 'Perez Soto';        v_emp_puesto_codigo(2) := 'PUE-ADM-AUX';
  v_emp_nombre(3) := 'Maria';     v_emp_apellido(3) := 'Gomez Ruiz';        v_emp_puesto_codigo(3) := 'PUE-ADM-AUX';
  v_emp_nombre(4) := 'Jose';      v_emp_apellido(4) := 'Hernandez Diaz';    v_emp_puesto_codigo(4) := 'PUE-CON-AUX';
  v_emp_nombre(5) := 'Pedro';     v_emp_apellido(5) := 'Castillo Ramos';    v_emp_puesto_codigo(5) := 'PUE-CON-NOM';
  v_emp_nombre(6) := 'David';     v_emp_apellido(6) := 'Mendez Garcia';     v_emp_puesto_codigo(6) := 'PUE-BOD-ASIS';
  v_emp_nombre(7) := 'Ever';      v_emp_apellido(7) := 'Morales Reyes';     v_emp_puesto_codigo(7) := 'PUE-BOD-ASIS';
  v_emp_nombre(8) := 'Julio';     v_emp_apellido(8) := 'Chavez Ortiz';      v_emp_puesto_codigo(8) := 'PUE-BOD-JEFE';
  v_emp_nombre(9) := 'Juan';      v_emp_apellido(9) := 'Ramirez Cruz';      v_emp_puesto_codigo(9) := 'PUE-BOD-ASIS';
  v_emp_nombre(10) := 'Rosa';     v_emp_apellido(10) := 'Vasquez Mejia';    v_emp_puesto_codigo(10) := 'PUE-VEN-ASE';
  v_emp_nombre(11) := 'Elsa';     v_emp_apellido(11) := 'Martinez Leon';    v_emp_puesto_codigo(11) := 'PUE-VEN-ASIS';
  v_emp_nombre(12) := 'Pablo';    v_emp_apellido(12) := 'Aguilar Flores';   v_emp_puesto_codigo(12) := 'PUE-VEN-ASE';

  FOR i IN 1..12 LOOP
    SELECT EMP_EMPLEADO_SEQ.NEXTVAL INTO v_emp_ids(i) FROM DUAL;
    v_pue_id := get_pue_id(v_emp_puesto_codigo(i));

    SELECT DEP_ID
    INTO v_dep_id
    FROM EMP_PUESTO
    WHERE PUE_ID = v_pue_id;

    INSERT INTO EMP_EMPLEADO (
      EMP_ID, EMP_NOMBRE, EMP_APELLIDO, EMP_DPI, EMP_NIT, EMP_TELEFONO,
      EMP_FECHA_CONTRATACION, EMP_ESTADO, TIC_ID, PUE_ID, SED_ID, HOR_ID, DEP_ID
    ) VALUES (
      v_emp_ids(i), v_emp_nombre(i), v_emp_apellido(i),
      3000000000000 + i,
      90000000 + i,
      50000000 + i,
      DATE '2026-01-01',
      'A',
      v_tic_id,
      v_pue_id,
      v_sed_id,
      v_hor_id,
      v_dep_id
    );

    INSERT INTO EMP_EMPLEADO_CONTRATO (
      TCO_ID, TCO_FECHA_INICIO, TCO_FECHA_FIN, TCO_ESTADO,
      TIC_FECHA_MODIFICACION, TIC_ID, EMP_ID, TCO_ES_ACTUAL, TCO_MOTIVO_CAMBIO
    ) VALUES (
      SEQ_CONTRATO.NEXTVAL, DATE '2026-01-01', NULL, 'A',
      SYSDATE, v_tic_id, v_emp_ids(i), 1, 'Carga de datos de prueba'
    );

    INSERT INTO EMP_CUENTA_BANCARIA (
      CUE_ID, CUE_NOMBRE, CUE_NUMERO, CUE_TIPO, EMP_ID
    ) VALUES (
      EMP_CUENTA_BANCARIA_SEQ.NEXTVAL,
      CASE WHEN MOD(i, 3) = 0 THEN 'Banco Industrial' WHEN MOD(i, 3) = 1 THEN 'Banrural' ELSE 'BAC' END,
      'GT' || TO_CHAR(100000000000 + i),
      'Monetaria',
      v_emp_ids(i)
    );
  END LOOP;

  -- Prestamos maestros. La nomina descuenta la cuota segun periodo y el saldo
  -- se reduce cuando la nomina aprobada se paga.
  FOR i IN 1..3 LOOP
    SELECT EMP_PRESTAMO_SEQ.NEXTVAL INTO v_pre_id FROM DUAL;

    INSERT INTO EMP_PRESTAMO (
      PRE_ID, PRE_MONTO_TOTAL, PRE_INTERES, PRE_PLAZO,
      PRE_CUOTA_MENSUAL, PRE_SALDO_PENDIENTE, PRE_FECHA_INICIO, PRE_ESTADO
    ) VALUES (
      v_pre_id,
      CASE i WHEN 1 THEN 1200 WHEN 2 THEN 1800 ELSE 2400 END,
      0,
      '12',
      CASE i WHEN 1 THEN 100 WHEN 2 THEN 150 ELSE 200 END,
      CASE i WHEN 1 THEN 1200 WHEN 2 THEN 1800 ELSE 2400 END,
      DATE '2026-02-01',
      'A'
    );

    UPDATE EMP_EMPLEADO
    SET PRE_ID = v_pre_id
    WHERE EMP_ID = v_emp_ids(CASE i WHEN 1 THEN 2 WHEN 2 THEN 8 ELSE 11 END);
  END LOOP;

  -- Marcajes diarios laborales desde enero hasta el 15 de mayo.
  -- Se generan entradas/salidas reales y algunas horas extra autorizadas.
  v_fecha := DATE '2026-01-01';
  WHILE v_fecha <= DATE '2026-05-15' LOOP
    -- ISO: lunes=0 ... domingo=6
    IF TRUNC(v_fecha) - TRUNC(v_fecha, 'IW') BETWEEN 0 AND 4 THEN
      FOR i IN 1..12 LOOP
        INSERT INTO EMP_MARCAJE (
          MAR_ID, MAR_FECHA, MAR_ENTRADA, MAR_SALIDA, EMP_ID, MAR_AUTORIZACION
        ) VALUES (
          EMP_MARCAJE_SEQ.NEXTVAL,
          v_fecha,
          v_fecha + (8 / 24),
          v_fecha + (17 / 24) +
            CASE
              WHEN MOD(i, 4) = 0 AND TO_CHAR(v_fecha, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') IN ('TUE', 'THU') THEN (1 / 24)
              WHEN MOD(i, 5) = 0 AND TO_CHAR(v_fecha, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') = 'FRI' THEN (2 / 24)
              ELSE 0
            END,
          v_emp_ids(i),
          1
        );
      END LOOP;
    END IF;

    v_fecha := v_fecha + 1;
  END LOOP;

  -- KPI para comisiones. Fechas dentro de cada periodo.
  INSERT INTO EMP_KPI (KPI_ID, KPI_NOMBRE, KPI_TIPO, KPI_VALOR)
  VALUES (EMP_KPI_SEQ.NEXTVAL, 'Venta mensual sobre meta', 'MONTO', 1)
  RETURNING KPI_ID INTO v_kpi_ventas;

  INSERT INTO EMP_KPI (KPI_ID, KPI_NOMBRE, KPI_TIPO, KPI_VALOR)
  VALUES (EMP_KPI_SEQ.NEXTVAL, 'Productividad operativa', 'MONTO', 1)
  RETURNING KPI_ID INTO v_kpi_meta;

  FOR p IN (
    SELECT PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN
    FROM EMP_PERIODO
    ORDER BY PER_FECHA_INICIO
  ) LOOP
    FOR i IN 1..12 LOOP
      IF i IN (8, 10, 11, 12) THEN
        INSERT INTO EMP_KPI_RESULTADO (
          KRE_ID, KRE_MONTO_TOTAL, KRE_CALCULO, KRE_FECHA, KPI_ID, EMP_ID
        ) VALUES (
          EMP_KRE_SEQ.NEXTVAL,
          CASE
            WHEN i = 8 THEN 300
            WHEN i = 10 THEN 600
            WHEN i = 11 THEN 750
            ELSE 500
          END * CASE WHEN (p.PER_FECHA_FIN - p.PER_FECHA_INICIO + 1) BETWEEN 14 AND 16 THEN 0.5 ELSE 1 END,
          100,
          p.PER_FECHA_FIN,
          v_kpi_ventas,
          v_emp_ids(i)
        );
      ELSIF i IN (4, 5, 6) THEN
        INSERT INTO EMP_KPI_RESULTADO (
          KRE_ID, KRE_MONTO_TOTAL, KRE_CALCULO, KRE_FECHA, KPI_ID, EMP_ID
        ) VALUES (
          EMP_KRE_SEQ.NEXTVAL,
          CASE WHEN i = 5 THEN 250 ELSE 125 END,
          100,
          p.PER_FECHA_FIN,
          v_kpi_meta,
          v_emp_ids(i)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Asignaciones operativas por empleado/periodo. La generacion de nomina toma
  -- estas asignaciones como fuente para salario, bonificacion y variables.
  FOR p IN (
    SELECT PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN
    FROM EMP_PERIODO
    ORDER BY PER_FECHA_INICIO
  ) LOOP
    FOR i IN 1..12 LOOP
      v_salary := get_pue_salary(v_emp_puesto_codigo(i));

      INSERT INTO EMP_NOMINA_ASIGNACION (
        NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
        NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
      ) VALUES (
        SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), v_tis_salario, NULL,
        'I', v_salary, NULL, 'SALARIO', 'Salario base mensual del puesto', 'A'
      );

      INSERT INTO EMP_NOMINA_ASIGNACION (
        NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
        NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
      ) VALUES (
        SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), v_tis_bonif, NULL,
        'I', 250, NULL, 'BONIFICACION', 'Bonificacion incentivo mensual', 'A'
      );

      IF i IN (1, 6, 9) AND EXTRACT(MONTH FROM p.PER_FECHA_INICIO) IN (2, 4) THEN
        INSERT INTO EMP_NOMINA_ASIGNACION (
          NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
          NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
        ) VALUES (
          SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), v_tis_otro, NULL,
          'I', 150, NULL, 'BONO-PUNTUALIDAD', 'Bono puntualidad periodo', 'A'
        );
      END IF;

      IF i IN (3, 7) AND EXTRACT(MONTH FROM p.PER_FECHA_INICIO) IN (3, 5) THEN
        INSERT INTO EMP_NOMINA_ASIGNACION (
          NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
          NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
        ) VALUES (
          SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), NULL, v_tds_anticipo,
          'D', 100, NULL, 'ANTICIPO', 'Anticipo autorizado', 'A'
        );
      END IF;

      IF i IN (5, 12) THEN
        INSERT INTO EMP_NOMINA_ASIGNACION (
          NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
          NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
        ) VALUES (
          SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), NULL, v_tds_judicial,
          'D', 200, NULL, 'JUDICIAL', 'Pension alimenticia', 'A'
        );
      END IF;

      IF i IN (2, 4, 10) THEN
        INSERT INTO EMP_NOMINA_ASIGNACION (
          NAS_ID, PER_ID, EMP_ID, TIS_ID, TDS_ID, NAS_TIPO, NAS_MONTO,
          NAS_CANTIDAD, NAS_REFERENCIA, NAS_DESCRIPCION, NAS_ESTADO
        ) VALUES (
          SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL, p.PER_ID, v_emp_ids(i), NULL, v_tds_otro,
          'D', 75, NULL, 'PARQUEO', 'Parqueo empresarial', 'A'
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Nominas calculadas desde los datos anteriores.
  -- Estados: A=aprobada para meses cerrados, P=pendiente para mayo.
  FOR p IN (
    SELECT PER_ID, PER_FECHA_INICIO, PER_FECHA_FIN, PER_FECHA_PAGO
    FROM EMP_PERIODO
    ORDER BY PER_FECHA_INICIO
  ) LOOP
    v_period_start := p.PER_FECHA_INICIO;
    v_period_end := p.PER_FECHA_FIN;
    v_period_pay := p.PER_FECHA_PAGO;
    v_factor := CASE WHEN (v_period_end - v_period_start + 1) BETWEEN 14 AND 16 THEN 0.5 ELSE 1 END;
    v_estado := CASE WHEN v_period_end < DATE '2026-05-01' THEN 'A' ELSE 'P' END;

    FOR i IN 1..12 LOOP
      v_salary := get_pue_salary(v_emp_puesto_codigo(i));
      v_salary_period := ROUND(v_salary * v_factor, 2);
      v_bonus_period := ROUND(250 * v_factor, 2);

      SELECT NVL(SUM(GREATEST(0, ((MAR_SALIDA - MAR_ENTRADA) * 24) - 9)), 0)
      INTO v_extra_hours
      FROM EMP_MARCAJE
      WHERE EMP_ID = v_emp_ids(i)
        AND TRUNC(MAR_FECHA) BETWEEN v_period_start AND v_period_end
        AND NVL(MAR_AUTORIZACION, 0) = 1;

      v_extra_amount := ROUND(v_extra_hours * (v_salary / 30 / 8) * 1.5, 2);

      SELECT NVL(SUM(KRE_MONTO_TOTAL), 0)
      INTO v_kpi_amount
      FROM EMP_KPI_RESULTADO
      WHERE EMP_ID = v_emp_ids(i)
        AND TRUNC(KRE_FECHA) BETWEEN v_period_start AND v_period_end;

      SELECT NVL(SUM(NAS_MONTO), 0)
      INTO v_other_income
      FROM EMP_NOMINA_ASIGNACION
      WHERE PER_ID = p.PER_ID
        AND EMP_ID = v_emp_ids(i)
        AND NAS_TIPO = 'I'
        AND TIS_ID = v_tis_otro
        AND NVL(NAS_ESTADO, 'A') = 'A';

      SELECT NVL(SUM(NAS_MONTO), 0)
      INTO v_anticipo
      FROM EMP_NOMINA_ASIGNACION
      WHERE PER_ID = p.PER_ID
        AND EMP_ID = v_emp_ids(i)
        AND NAS_TIPO = 'D'
        AND TDS_ID = v_tds_anticipo
        AND NVL(NAS_ESTADO, 'A') = 'A';

      SELECT NVL(SUM(NAS_MONTO), 0)
      INTO v_judicial
      FROM EMP_NOMINA_ASIGNACION
      WHERE PER_ID = p.PER_ID
        AND EMP_ID = v_emp_ids(i)
        AND NAS_TIPO = 'D'
        AND TDS_ID = v_tds_judicial
        AND NVL(NAS_ESTADO, 'A') = 'A';

      SELECT NVL(SUM(NAS_MONTO), 0)
      INTO v_other_discount
      FROM EMP_NOMINA_ASIGNACION
      WHERE PER_ID = p.PER_ID
        AND EMP_ID = v_emp_ids(i)
        AND NAS_TIPO = 'D'
        AND TDS_ID = v_tds_otro
        AND NVL(NAS_ESTADO, 'A') = 'A';

      BEGIN
        SELECT LEAST(NVL(pres.PRE_SALDO_PENDIENTE, 0), ROUND(NVL(pres.PRE_CUOTA_MENSUAL, 0) * v_factor, 2))
        INTO v_loan_payment
        FROM EMP_PRESTAMO pres
        JOIN EMP_EMPLEADO emp ON emp.PRE_ID = pres.PRE_ID
        WHERE emp.EMP_ID = v_emp_ids(i)
          AND NVL(pres.PRE_SALDO_PENDIENTE, 0) > 0
          AND UPPER(NVL(pres.PRE_ESTADO, 'A')) IN ('A', 'ACTIVO')
          AND TRUNC(NVL(pres.PRE_FECHA_INICIO, v_period_start)) <= v_period_end;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          v_loan_payment := 0;
      END;

      v_total_ing := ROUND(v_salary_period + v_bonus_period + v_extra_amount + v_kpi_amount + v_other_income, 2);
      v_total_desc := ROUND(
        ROUND((v_salary_period + v_extra_amount + v_kpi_amount) * 0.0483, 2)
        + ROUND(calc_isr_mensual(v_salary) * v_factor, 2)
        + v_loan_payment
        + v_anticipo
        + v_judicial
        + v_other_discount,
        2
      );
      v_liquido := ROUND(v_total_ing - v_total_desc, 2);

      SELECT EMP_NOMINA_SEQ.NEXTVAL INTO v_nom_id FROM DUAL;

      INSERT INTO EMP_NOMINA (
        NOM_ID, NOM_TOTAL_INGRESOS, NOM_TOTAL_DESCUENTO, NOM_SALARIO_LIQUIDO,
        NOM_FECHA_GENERACION, PER_ID, EMP_ID, LIQ_ID, NOM_ESTADO
      ) VALUES (
        v_nom_id, v_total_ing, v_total_desc, v_liquido,
        v_period_pay, p.PER_ID, v_emp_ids(i), NULL, v_estado
      );

      add_nom_det(NULL, v_salary_period, v_tis_salario, NULL, NULL);
      add_nom_det(NULL, v_bonus_period, v_tis_bonif, NULL, NULL);
      add_nom_det(v_extra_hours, v_extra_amount, v_tis_extra, NULL, NULL);
      add_nom_det(NULL, v_kpi_amount, v_tis_comision, NULL, NULL);
      add_nom_det(NULL, v_other_income, v_tis_otro, NULL, NULL);

      add_nom_det(NULL, ROUND((v_salary_period + v_extra_amount + v_kpi_amount) * 0.0483, 2), NULL, v_tds_igss, NULL);
      add_nom_det(NULL, ROUND(calc_isr_mensual(v_salary) * v_factor, 2), NULL, v_tds_isr, NULL);

      IF v_loan_payment > 0 THEN
        SELECT emp.PRE_ID INTO v_pre_id
        FROM EMP_EMPLEADO emp
        WHERE emp.EMP_ID = v_emp_ids(i);

        add_nom_det(v_pre_id, v_loan_payment, NULL, v_tds_prestamo, NULL);

        -- Si la nomina esta aprobada, el pago queda aplicado al saldo.
        IF v_estado = 'A' THEN
          SELECT PRE_SALDO_PENDIENTE INTO v_saldo
          FROM EMP_PRESTAMO
          WHERE PRE_ID = v_pre_id;

          v_saldo := ROUND(GREATEST(0, v_saldo - v_loan_payment), 2);

          INSERT INTO EMP_PRESTAMO_DETALLE (
            PDE_ID, PDE_NUMERO_CUOTA, PDE_FECHA_PAGO, PDE_MONTO,
            PDE_SALDO_RESTANTE, PDE_ESTADO, PRE_ID, NOM_ID
          ) VALUES (
            SEQ_EMP_PRESTAMO_DETALLE.NEXTVAL,
            (SELECT NVL(MAX(PDE_NUMERO_CUOTA), 0) + 1 FROM EMP_PRESTAMO_DETALLE WHERE PRE_ID = v_pre_id),
            v_period_pay,
            v_loan_payment,
            v_saldo,
            'A',
            v_pre_id,
            v_nom_id
          );

          UPDATE EMP_PRESTAMO
          SET PRE_SALDO_PENDIENTE = v_saldo,
              PRE_ESTADO = CASE WHEN v_saldo <= 0 THEN 'I' ELSE PRE_ESTADO END
          WHERE PRE_ID = v_pre_id;
        END IF;
      END IF;

      add_nom_det(NULL, v_anticipo, NULL, v_tds_anticipo, NULL);
      add_nom_det(NULL, v_judicial, NULL, v_tds_judicial, NULL);
      add_nom_det(NULL, v_other_discount, NULL, v_tds_otro, NULL);
    END LOOP;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Datos de prueba generados correctamente.');
END;
/

-- ============================================================================
-- 5. Consultas de verificacion para reporteria
-- ============================================================================

PROMPT === Resumen general ===
SELECT 'EMPLEADOS' tabla, COUNT(*) total FROM EMP_EMPLEADO
UNION ALL SELECT 'MARCAJES', COUNT(*) FROM EMP_MARCAJE
UNION ALL SELECT 'ASIGNACIONES', COUNT(*) FROM EMP_NOMINA_ASIGNACION
UNION ALL SELECT 'NOMINAS', COUNT(*) FROM EMP_NOMINA
UNION ALL SELECT 'DETALLE_NOMINA', COUNT(*) FROM EMP_NOMINA_DETALLE
UNION ALL SELECT 'PRESTAMO_DETALLE', COUNT(*) FROM EMP_PRESTAMO_DETALLE;

PROMPT === Totales por periodo ===
SELECT
  p.PER_ID,
  TO_CHAR(p.PER_FECHA_INICIO, 'YYYY-MM-DD') AS FECHA_INICIO,
  TO_CHAR(p.PER_FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN,
  COUNT(n.NOM_ID) AS NOMINAS,
  ROUND(SUM(n.NOM_TOTAL_INGRESOS), 2) AS TOTAL_INGRESOS,
  ROUND(SUM(n.NOM_TOTAL_DESCUENTO), 2) AS TOTAL_DESCUENTOS,
  ROUND(SUM(n.NOM_SALARIO_LIQUIDO), 2) AS TOTAL_LIQUIDO
FROM EMP_PERIODO p
LEFT JOIN EMP_NOMINA n ON n.PER_ID = p.PER_ID
GROUP BY p.PER_ID, p.PER_FECHA_INICIO, p.PER_FECHA_FIN
ORDER BY p.PER_FECHA_INICIO;

PROMPT === Planilla clasificada por columnas ===
SELECT
  n.NOM_ID,
  e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO,
  d.DEP_NOMBRE AS DEPARTAMENTO,
  pu.PUE_NOMBRE AS PUESTO,
  SUM(CASE WHEN i.TIS_CODIGO = 'SALARIO' THEN nd.DET_MONTO ELSE 0 END) AS SALARIO_ORD,
  SUM(CASE WHEN i.TIS_CODIGO = 'BONIF-INC' THEN nd.DET_MONTO ELSE 0 END) AS BONIFICACION,
  SUM(CASE WHEN i.TIS_CODIGO = 'HORA-EXTRA' THEN nd.DET_REFERENCIA ELSE 0 END) AS HORAS_EXTRA,
  SUM(CASE WHEN i.TIS_CODIGO = 'HORA-EXTRA' THEN nd.DET_MONTO ELSE 0 END) AS SUELDO_EXTRA,
  SUM(CASE WHEN i.TIS_CODIGO = 'COMISION' THEN nd.DET_MONTO ELSE 0 END) AS COMISIONES,
  SUM(CASE WHEN i.TIS_CODIGO = 'OTRO-ING' THEN nd.DET_MONTO ELSE 0 END) AS OTROS_INGRESOS,
  n.NOM_TOTAL_INGRESOS,
  SUM(CASE WHEN ds.TDS_CODIGO = 'IGSS-LAB' THEN nd.DET_MONTO ELSE 0 END) AS IGSS,
  SUM(CASE WHEN ds.TDS_CODIGO = 'ISR' THEN nd.DET_MONTO ELSE 0 END) AS ISR,
  SUM(CASE WHEN ds.TDS_CODIGO = 'PRESTAMO' THEN nd.DET_MONTO ELSE 0 END) AS PRESTAMO,
  SUM(CASE WHEN ds.TDS_CODIGO = 'JUDICIAL' THEN nd.DET_MONTO ELSE 0 END) AS JUDICIAL,
  SUM(CASE WHEN ds.TDS_CODIGO = 'OTRO-EGR' THEN nd.DET_MONTO ELSE 0 END) AS OTROS_EGRESOS,
  n.NOM_TOTAL_DESCUENTO,
  n.NOM_SALARIO_LIQUIDO,
  n.NOM_ESTADO
FROM EMP_NOMINA n
JOIN EMP_EMPLEADO e ON e.EMP_ID = n.EMP_ID
LEFT JOIN EMP_PUESTO pu ON pu.PUE_ID = e.PUE_ID
LEFT JOIN EMP_DEPARTAMENTO d ON d.DEP_ID = e.DEP_ID
LEFT JOIN EMP_NOMINA_DETALLE nd ON nd.NOM_ID = n.NOM_ID
LEFT JOIN EMP_INGRESO i ON i.TIS_ID = nd.TIS_ID
LEFT JOIN EMP_DESCUENTO ds ON ds.TDS_ID = nd.TDS_ID
GROUP BY
  n.NOM_ID,
  e.EMP_NOMBRE,
  e.EMP_APELLIDO,
  d.DEP_NOMBRE,
  pu.PUE_NOMBRE,
  n.NOM_TOTAL_INGRESOS,
  n.NOM_TOTAL_DESCUENTO,
  n.NOM_SALARIO_LIQUIDO,
  n.NOM_ESTADO
ORDER BY d.DEP_NOMBRE, e.EMP_APELLIDO, e.EMP_NOMBRE;

PROMPT === Prestamos y pagos aplicados por nomina aprobada ===
SELECT
  p.PRE_ID,
  e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO,
  p.PRE_MONTO_TOTAL,
  p.PRE_CUOTA_MENSUAL,
  p.PRE_SALDO_PENDIENTE,
  COUNT(pd.PDE_ID) AS PAGOS_APLICADOS,
  NVL(SUM(pd.PDE_MONTO), 0) AS TOTAL_PAGADO
FROM EMP_PRESTAMO p
JOIN EMP_EMPLEADO e ON e.PRE_ID = p.PRE_ID
LEFT JOIN EMP_PRESTAMO_DETALLE pd ON pd.PRE_ID = p.PRE_ID
GROUP BY
  p.PRE_ID,
  e.EMP_NOMBRE,
  e.EMP_APELLIDO,
  p.PRE_MONTO_TOTAL,
  p.PRE_CUOTA_MENSUAL,
  p.PRE_SALDO_PENDIENTE
ORDER BY p.PRE_ID;

COMMIT;

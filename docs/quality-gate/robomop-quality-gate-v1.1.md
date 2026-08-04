# RoboMop New Era — Assessment consolidado del Quality Gate

**Versión:** 1.1

**Fecha de corte:** 3 de agosto de 2026

**Reunión de aprobación:** 4 de agosto de 2026

**Propuesta pública:** https://sebbarrio.github.io/RoboMop/proposal/

**Repositorio:** https://github.com/SebBarrio/RoboMop

**Rama base:** `Droid-implementation`

**Baseline publicado:** merge commit `241f3dcbe9fca43e79736aa99fbec0c7a464ec29` más los cambios posteriores de la rama base

**Estado del documento:** Assessment de preparación para presentación, aprobación provisional, NTP y futuro contrato

---

## 1. Dictamen ejecutivo

| Gate | Dictamen | Condición |
|---|---|---|
| Presentación de la propuesta pública | **GO** | La URL pública fue verificada con las cifras corregidas. |
| Negociación de alcance, costo y baseline técnico | **GO** | La reunión del 4 de agosto es el gate de decisión. |
| Aprobación conceptual del nuevo chasis | **GO para decisión** | Debe quedar documentada en el acta; no equivale a liberación de CAD para fabricación. |
| Firma provisional del Project Charter | **CONDITIONAL GO** | Requiere registrar reservas comerciales, técnicas y documentales. |
| Emisión de NTP e inicio de Semana 1 | **CONDITIONAL GO** | Sólo después de firma provisional y NTP escrito del Sponsor. |
| Contrato comercial definitivo | **NO-GO / no auditable** | El contrato todavía no existe; debe redactarse después de la negociación. |
| Liberación del CAD para fabricación | **NO-GO** | El CAD actual refleja la iteración anterior; debe actualizarse y aprobarse en PDR. |
| Aceptación técnica final del producto | **NO-GO por definición** | Requiere campañas físicas y evidencia de aceptación en Semana 16. |

> **Conclusión:** La versión pública está en condición de ser presentada. La reunión debe utilizarse para aprobar provisionalmente el proyecto y el nuevo baseline técnico. La firma y el NTP son condicionales a que las decisiones abiertas queden documentadas; no debe afirmarse que el CAD ya representa el nuevo chasis ni que el desempeño físico ya fue demostrado.

---

## 2. Contexto y propósito

RoboMop se reconstruirá como un producto autónomo de limpieza integrado y verificable. La arquitectura 2025 se conserva únicamente como evidencia de lecciones, fallos y requisitos de prevención; no es la arquitectura que debe preservarse.

Lecciones principales de 2025:

- autonomía física de aproximadamente 25–30 minutos;
- conectores de alta corriente intermitentes;
- sobrecalentamiento del puente H después de movimiento no controlado;
- conexiones de encoder poco confiables;
- competencia entre cómputo de alto nivel y control en tiempo real;
- desincronización LiDAR–odometría–IMU y offsets de mapa;
- integración incompleta de irrigación;
- claims de autonomía y mapeo que requieren revalidación física.

La nueva fase busca una unidad final integrada dentro del alcance aprobado, sin homologación regulatoria en esta fase. La posible expansión hasta diez unidades se considera una fase posterior.

---

## 3. Baseline comercial y financiero

### 3.1 Presupuesto reconciliado

| Concepto | MXN |
|---|---:|
| Hardware base | $49,739.85 |
| Contingencia de hardware del Sponsor, 15% | $7,460.98 |
| Forecast de hardware con contingencia | **$57,200.83** |
| Techo propuesto de hardware | **$58,000.00** |
| Servicios del Project Manager | **$160,000.00** |
| Servicios del Senior Engineer | **$160,000.00** |
| Servicios profesionales totales | **$320,000.00** |
| Presupuesto planeado del proyecto | **$377,200.83** |
| Referencia máxima de hardware + servicios | **$378,000.00** |

El presupuesto planeado está expresado **antes de las cargas fiscales aplicables**. Por ello, la referencia de MXN $378,000 no debe presentarse como un costo total absoluto si IVA, retenciones, importación, aranceles, brokerage, envío o variación cambiaria se autorizan adicionalmente.

### 3.2 Administración de hardware

- El hardware es un presupuesto del proyecto, no un anticipo global al equipo.
- El Sponsor paga directamente al proveedor o reembolsa compras previamente autorizadas.
- Cada compra debe tener autorización, factura/CFDI o comprobante válido, evidencia de pago, evidencia de recepción y registro en el ledger.
- La contingencia pertenece al Sponsor.
- El remanente no utilizado permanece con el Sponsor.
- El uso de contingencia requiere autorización escrita.
- Antes de cada compra crítica se deben confirmar part number, interfaces, rating, lead time, costo puesto en destino y alternativa.

### 3.3 Servicios profesionales

- Project Manager: MXN $160,000 por el desarrollo completo de 16 semanas.
- Senior Engineer: MXN $160,000 por el desarrollo completo de 16 semanas.
- Total: MXN $320,000.
- Los servicios no se cargan al presupuesto ni a la contingencia de hardware.

El contrato futuro debe definir para cada profesional:

- si el importe es antes o después de IVA/retenciones;
- hitos, fechas y mecanismo de pago;
- facturación individual;
- trabajo devengado;
- terminación anticipada;
- indisponibilidad o reemplazo;
- aceptación de servicios;
- correcciones posteriores a Semana 16.

---

## 4. Organización y autoridad

| Rol | Persona | Responsabilidad principal |
|---|---|---|
| Sponsor | Luis Vazquez | Aprueba Charter, presupuesto, contingencia, cambios mayores, gates y aceptación comercial. |
| Project Manager | Germán Velázquez | Alcance, calendario, costo, compras, BoM, riesgos, cambios, releases, documentación, ensamble e integración. |
| Senior Engineer | Sebastian Barrio | Arquitectura, mecánica, electrónica, acumulador, PCBs, firmware, ROS/Isaac, autonomía, percepción e integración técnica. |

Germán y Sebastian pueden detener inmediatamente una prueba por movimiento no controlado, anomalía de batería/BMS, calentamiento, riesgo eléctrico, pérdida de comunicación, fuga de agua o cualquier condición insegura.

---

## 5. Inicio y calendario

- Duración planeada: 16 semanas.
- Semana 1 empieza el primer día hábil posterior a que existan simultáneamente:
  1. firma provisional del Charter;
  2. NTP o luz verde escrita del Sponsor.
- Antes del NTP no corre el calendario ni se comprometen compras.
- Enfoque híbrido: fases y gates tipo waterfall, ejecución en sprints semanales.
- Feature freeze: fin de Semana 12.
- Verificación: Semanas 13–14.
- Corrección y regresión: Semana 15.
- FAT, entrega y cierre: Semana 16.
- Semana 16 no debe utilizarse para completar desarrollo pendiente.

### Gates

| Gate | Momento | Salida requerida |
|---|---:|---|
| G0 | Inicio | Charter provisional firmado + NTP escrito. |
| G1 — SRR | Fin W1 | Requisitos, hazards, ambiente y matriz de aceptación congelados. |
| G2 — PDR | Fin W2 | Arquitectura, CAD/layout, interfaces, BoM, sourcing y long-leads aprobados. |
| G3 | Fin W8 | Evidencia cuantitativa de subsistemas. |
| G4 | Fin W12 | Robot integrado y feature freeze. |
| G5 | Fin W14 | Pruebas obligatorias ejecutadas; P0 = 0; plan de cierre P1. |
| G6 | W16 | Requisitos no dispensables aprobados, entrega y aceptación. |

Cada gate debe registrar entradas, evidencia, quorum, aprobadores, decisión `Pass / Conditional Pass / Fail`, condiciones, owner, fecha de cierre y regla de reapertura.

---

## 6. Baseline técnico propuesto

- Compute: NVIDIA Jetson Orin Nano 8GB Super Dev Kit + SSD NVMe 256 GB.
- Control determinista: ESP32-S3-WROOM-1 N16R8.
- Arquitectura separada: autonomía/percepción en SBC; control de motores y safe states en MCU.
- Acumulador: LFP 8S2P, 16 celdas, 25.6 V nominales, 40 Ah.
- Energía nominal: 1,024 Wh.
- Modelo operativo: 960 Wh utilizables para planeación.
- Drivetrain propuesto: dos motorreductores 24 V, 100 W, encoders 500 ppr.
- Percepción: dos cámaras, dos RPLIDAR S2, IMU y sensores auxiliares.
- Irrigación: tanque, bomba, nivel, flujo y detección de fuga.
- Simulación: ROS 2, Isaac Sim e Isaac ROS.
- Conectividad: backend/frontend, telemetría, comandos, alertas y recuperación de estado.
- Electrónica: tarjetas separadas de potencia/control y portadora Jetson.

### PCBs

- PCB 1: USD $160.
- PCB 2: USD $180.
- Total de planeación: USD $340 × MXN $18/USD = MXN $6,120.
- Antes de comprar debe confirmarse si la cotización incluye componentes, ensamble, setup, NRE, programación, test, envío, impuestos y rework.

---

## 7. Condición controlada del CAD y nuevo chasis

La propuesta pública contiene el baseline técnico más reciente. El CAD disponible corresponde a la iteración anterior y **todavía no representa el nuevo chasis propuesto**.

Esto no se considera una contradicción oculta ni un fallo que impida la presentación. La negociación del 4 de agosto de 2026 será el gate para:

1. aprobar o rechazar el concepto del nuevo chasis;
2. autorizar la actualización del CAD;
3. reconciliar propuesta, Charter, CAD, layout y BoM;
4. definir materiales, estructura, dimensiones, masa y manufacturabilidad;
5. confirmar el efecto sobre costo y calendario.

Hasta esa aprobación:

- el CAD histórico no constituye evidencia de conformidad;
- no debe liberarse fabricación contra el CAD histórico;
- no debe afirmarse que el nuevo diseño ya está completamente documentado;
- la propuesta debe identificarse como baseline técnico **propuesto para aprobación**.

### Acción posterior a la aprobación

| Campo | Requisito |
|---|---|
| Dueño técnico | Senior Engineer |
| Control documental | Project Manager |
| Fecha objetivo | PDR, fin de Semana 2 |
| Archivos | CAD, layout, BoM, renders e interfaces afectadas |
| Revisión | Mecánica, eléctrica, térmica, seguridad y manufacturabilidad |
| Evidencia | Revisión versionada, acta PDR y decisión de gate |
| Cambio material | Aplicar la clase de cambio más alta activada |

La aprobación conceptual del chasis no equivale a liberación para fabricación ni aceptación técnica final.

---

## 8. Modelo energético y aceptación física

### Cálculo

- Energía nominal: `25.6 V × 40 Ah = 1,024 Wh`.
- Energía operativa del modelo: 960 Wh.
- Perfil promedio de referencia: 200 W.
- Autonomía estimada: `960 Wh ÷ 200 W = 4.8 h`.
- Energía requerida para cuatro horas: `200 W × 4 h = 800 Wh`.
- Reserva del modelo: `960 Wh − 800 Wh = 160 Wh`.
- Margen: `160 Wh ÷ 800 Wh = 20% sobre la energía mínima de cuatro horas`.

Las 4.8 horas son una estimación de ingeniería. El criterio físico es **≥4.0 horas desde 100% bajo el perfil acordado**, con logs de SoC, voltajes, temperaturas, potencia y eventos.

Entrega base:

- un acumulador LFP;
- un cargador compatible;
- swap objetivo ≤5 minutos;
- controles activos durante el swap;
- respaldo objetivo de diseño ≥10 minutos, por confirmar en SRR.

---

## 9. Matriz provisional de aceptación

| ID | Requisito | Umbral inicial | Evidencia | Waiver |
|---|---|---|---|---|
| ACC-01 | Entrega integrada | 1 robot, 1 acumulador, 1 cargador, software y paquete técnico | Inspección y acta | No para faltantes obligatorios |
| ACC-02 | Autonomía | ≥4.0 h @200 W | Logs + validación interna + FAT | No |
| ACC-03 | Swap | ≤5 min, controles activos, sin arco/reinicio | Video, cronómetro y logs; 3 repeticiones | No si inseguro |
| ACC-04 | E-stop e inhibición | Estado seguro, sin rearranque automático | Osciloscopio, logs y fault injection | No |
| ACC-05 | Movimiento no controlado | 0 eventos | Hazard/defect log | No |
| ACC-06 | Navegación/cobertura | ≥95% área alcanzable; 0 colisiones; ≥9/10 misiones | Ground truth, mapa y rosbag | Clase 3; nunca colisión insegura |
| ACC-07 | Localización | RMS ≤0.20 m; relocalización ≤30 s | Ground truth + rosbag | Clase 3 antes de FAT |
| ACC-08 | Limpieza/irrigación | ≥90% remoción; flujo ±15%; 0 fugas a electrónica | Before/after, flujo y leak test | No para fuga |
| ACC-09 | Percepción | ≥90% recall; ≤10% falsos positivos | Dataset, replay y prueba física | Clase 3 antes de FAT |
| ACC-10 | Conectividad | Recuperación ≤60 s; ≥99% telemetría registrada | Logs robot/backend | Clase 3 antes de FAT |
| ACC-11 | Seguridad eléctrica/térmica | 0 condiciones fuera de límites o agua en electrónica | Logs, inspección, fault/leak tests | No |
| ACC-12 | Documentación | 100% del paquete técnico versionado | Checklist de release | P2 editorial |

ACC-06 a ACC-10 son valores iniciales para ratificación. No podrán relajarse después de observar resultados. Un cambio material requiere Change Class 3.

### Severidad

- **P0:** crítico/release blocker; stop-work, causa raíz, corrección, regresión y cierre técnico; sin waiver comercial.
- **P1:** incumplimiento mayor sin hazard crítico; cierre antes de FAT o disposición conjunta escrita con plazo y retest.
- **P2:** defecto menor/editorial; punch list documentado, sin impacto en seguridad, función o evidencia.

---

## 10. Riesgos prioritarios

| ID | Riesgo | Nivel | Respuesta |
|---|---|---|---|
| R01 | Calendario de 16 semanas comprimido | Rojo | Freeze W2/W12, WIP limitado y recovery plan. |
| R02 | Equipo ejecutor de dos personas | Rojo | Priorizar ruta crítica, reservar capacidad y reducir alcance no esencial. |
| R03 | PCBs/componentes tardíos | Rojo | Compra temprana, tracking y fallback. |
| R04 | Datos de celda, masa o proveedor incorrectos | Rojo | Datasheet, part number y muestra física W1. |
| R05 | Consumo promedio >200 W | Rojo | Medición temprana y correlación del modelo energético. |
| R06 | Hot swap, conector o respaldo inestable | Rojo | Pruebas de inrush, temperatura y ciclos. |
| R07 | Errores de timestamps/frames | Rojo | Timebase único, timestamps de origen y replay. |
| R08 | Simulación no correlacionada | Rojo | Provenance y correlation gates. |
| R09 | Fuga hacia electrónica | Rojo | Segregación, drip paths, sensor y leak test. |
| R10 | Alcance de software excede capacidad | Rojo | Priorizar acceptance path y congelar funciones. |
| R11 | Hardware excede MXN $58,000 | Rojo | Cotizaciones landed, ledger y contingencia controlada. |
| R12 | Movimiento no controlado | Crítico | Inhibit, E-stop, watchdog, pruebas escalonadas y P0 inmediato. |

---

## 11. Estado de publicación y validación documental

La versión pública fue verificada después del merge del PR #4.

Confirmaciones:

- no contiene el monto anterior MXN $54,162.53;
- no contiene “TODO INCLUIDO”;
- contiene MXN $377,200.83;
- separa `pmServices` y `seniorServices`;
- OBJ-02 muestra PM MXN $160,000, Senior Engineer MXN $160,000 y servicios totales MXN $320,000;
- el PR #4 fue fusionado;
- JavaScript y HTML fueron validados localmente;
- el bundle autocontenido fue regenerado;
- el render de escritorio no presentó clipping bloqueante;
- no se identificaron secretos en las líneas añadidas;
- no se reportaron checks de CI automáticos en el PR.

La ausencia de CI no bloquea la presentación, pero se recomienda incorporar validaciones automáticas para futuras revisiones.

---

## 12. Condiciones para firma provisional y NTP

Antes de firmar o como anexo simultáneo, registrar:

1. si la firma del Charter genera obligación de pago o sólo aprueba presupuesto;
2. cuándo se devengan los honorarios;
3. hitos y fechas de facturación de cada profesional;
4. IVA, retenciones y tratamiento fiscal;
5. cancelación, terminación anticipada y trabajo devengado;
6. correcciones P1/P2 posteriores a Semana 16;
7. propiedad y disposición del hardware si se cancela el proyecto;
8. orden de precedencia documental;
9. aprobación del nuevo chasis y condición del CAD histórico;
10. mecanismo para ratificar la matriz en SRR;
11. identidad jurídica, IP, garantía, responsabilidad y límites de uso para el contrato futuro.

### Orden de precedencia recomendado

1. contrato firmado;
2. anexos comerciales y de aceptación firmados;
3. Project Charter firmado;
4. matriz y actas de gate aprobadas;
5. CAD/BoM/release técnico controlado;
6. propuesta comercial versionada;
7. material informativo no controlado.

---

## 13. Decisiones que debe producir la reunión

| ID | Decisión | Resultado permitido |
|---|---|---|
| DEC-01 | Aprobar alcance y entrega de esta fase | Aprobar / Condicionar / Rechazar |
| DEC-02 | Aprobar MXN $57,200.83 de forecast de hardware y techo MXN $58,000 | Aprobar / Ajustar |
| DEC-03 | Aprobar MXN $160,000 para PM y MXN $160,000 para Senior Engineer | Aprobar / Ajustar |
| DEC-04 | Definir tratamiento fiscal y pagos | Acordado / Pendiente contractual |
| DEC-05 | Aprobar el nuevo concepto de chasis | Aprobar / Condicionar / Rechazar |
| DEC-06 | Autorizar actualización y sustitución del CAD anterior | Sí / No / Condicionada |
| DEC-07 | Ratificar matriz inicial o registrar cambios | Ratificar / Change Class 3 |
| DEC-08 | Aprobar la regla de firma provisional + NTP | Aprobar / Ajustar |
| DEC-09 | Autorizar compras long-lead después de NTP | Sí / No / Por compra |
| DEC-10 | Definir próximos pasos del contrato | Owner y fecha |

---

## 14. Evidencia pendiente durante el proyecto

La presentación no constituye evidencia física de:

- autonomía de cuatro horas;
- hot swap;
- seguridad eléctrica/térmica;
- E-stop e inhibición;
- navegación, localización o cobertura;
- percepción;
- limpieza e irrigación;
- conectividad;
- integridad estructural;
- desempeño del nuevo chasis.

Estas afirmaciones permanecen como requisitos o estimaciones hasta que se produzca evidencia trazable y se apruebe en los gates correspondientes.

---

## 15. Quality gate final

### GO

- presentar la propuesta pública;
- negociar alcance, presupuesto y términos;
- usar la reunión como gate de aprobación conceptual del nuevo diseño;
- aprobar provisionalmente el baseline si las reservas quedan registradas.

### CONDITIONAL GO

- firmar el Charter;
- emitir el NTP;
- autorizar compras;
- iniciar Semana 1.

Las condiciones son el registro escrito de las decisiones comerciales, la aprobación del nuevo chasis, el tratamiento del CAD anterior y el mecanismo de cierre contractual.

### NO-GO

- afirmar que el CAD histórico representa el nuevo diseño;
- liberar fabricación contra CAD no actualizado;
- afirmar que existe un contrato definitivo;
- presentar 4.8 h como resultado físico ya aprobado;
- afirmar homologación;
- aceptar el producto final sin evidencia física y sin cerrar P0.

---

## 16. Firmas del assessment

| Rol | Nombre | Dictamen | Fecha | Firma |
|---|---|---|---|---|
| Sponsor | Luis Vazquez | Conforme / Con reservas / No conforme |  |  |
| Project Manager | Germán Velázquez | Conforme / Con reservas / No conforme |  |  |
| Senior Engineer | Sebastian Barrio | Conforme / Con reservas / No conforme |  |  |

---

**Documento controlado — RoboMop New Era — Quality Gate v1.1**

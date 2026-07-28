// ═══ §1 · Prototipo 2025 vs. RoboMop New Era ═══
(function () {
  const host = document.getElementById("failfix-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "Prototipo 2025 vs. RoboMop New Era",
    sub: "CLIC EN UNA FILA PARA VER LA INGENIERÍA DETRÁS DE CADA MEJORA",
    src: "RoboMop New Era · base de ingeniería, julio 2026",
  });

  const rows = [
    {
      was: "Los motores podían dispararse y sobrecalentar la electrónica de potencia",
      is: "Un lazo de seguridad en hardware que corta la potencia de los motores aunque todas las computadoras a bordo fallen",
      how: "El lazo de control de motores corre en un controlador dedicado de tiempo real con un watchdog de hardware; las entradas de falla cortan la potencia en silicio — ninguna ruta de software puede anular el paro.",
    },
    {
      was: "Pulsos perdidos de los sensores de rueda, así que las estimaciones de posición vagaban",
      is: "Odometría que no puede perder un pulso, a cualquier carga de trabajo",
      how: "Los pulsos de cuadratura los cuentan periféricos de hardware PCNT dedicados — silicio, no software — así que los picos de carga de SLAM no pueden costar ni un solo flanco de encoder.",
    },
    {
      was: "Los sensores no se ponían de acuerdo sobre la hora; cada mapa se desviaba lentamente",
      is: "Un solo reloj para cada sensor — mapas que se quedan en su lugar, turno tras turno",
      how: "El controlador marca con sello de tiempo la odometría y la IMU en el instante de captura y sincroniza su reloj con la computadora principal, así la fusión de sensores corre contra una sola base de tiempo.",
    },
    {
      was: "Una computadora sobrecargada lo corría todo — y ahogaba los motores",
      is: "Dos cerebros dedicados: uno piensa, uno conduce — ninguno puede ahogar al otro",
      how: "El mapeo, la planeación y la red viven en la computadora de IA; el control de motores vive en el controlador de tiempo real. Las cargas pesadas de IA ya no pueden tocar la temporización del lazo.",
    },
    {
      was: "Unos 25–30 minutos de limpieza por carga",
      is: "≈4.8 horas a un consumo de 200 watts — y un cambio de cinco minutos para trabajar todo el día",
      how: "El paquete se dimensiona con un modelo energético a un consumo promedio sostenido de 200 watts; la barra de aceptación de 4 horas pasa con un margen del 20% antes de ordenar una sola celda.",
    },
    {
      was: "La irrigación se prometió pero nunca se integró realmente",
      is: "Entrega de agua cableada desde el día uno — dosificación, nivel y detección de fugas",
      how: "La bomba, la válvula y los sensores de nivel y flujo son nodos de primera clase en el controlador supervisado, con un bus CAN reservado para accesorios futuros.",
    },
  ];

  const wrap = document.createElement("div");
  wrap.className = "failfix";
  wrap.innerHTML = `<div class="ff-head"><span>El prototipo de 2025</span><span>RoboMop New Era</span></div>`;
  rows.forEach(r => {
    const d = document.createElement("div");
    d.className = "ff-row";
    d.setAttribute("data-drill-keep", "");
    d.innerHTML = `<div class="ff-was">${r.was}</div><div class="ff-is">${r.is}</div>`;
    d.addEventListener("click", e => U.showDrill({
      title: "CÓMO FUNCIONA", value: r.is.split("—")[0].trim(),
      sub: r.how, source: "RoboMop New Era · base de ingeniería, julio 2026", x: e.clientX, y: e.clientY
    }));
    wrap.appendChild(d);
  });
  body.appendChild(wrap);
})();

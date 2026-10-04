import type {
  SceneState,
  SpatialSceneProvider,
} from "@/frontend/domain/contracts/providers";
/** A local, illustrative isometric site plan. Not a measured reconstruction. */
export const schematicSceneProvider: SpatialSceneProvider = {
  mount(container, initial, onSelect) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 760 480");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Illustrative isometric interchange with selectable infrastructure annotations",
    );
    container.append(svg);
    function draw(state: SceneState) {
      svg.replaceChildren();
      function el(name: string, attrs: Record<string, string>, text?: string) {
        const n = document.createElementNS(ns, name);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text) n.textContent = text;
        svg.append(n);
        return n;
      }
      const project = (x: number, z: number, y = 0) => [
        380 + x * 17 - z * 17,
        235 + x * 8 + z * 8 - y * 20,
      ];
      const polygon = (coords: number[][], fill: string, stroke = "#8eaaa1") =>
        el("polygon", {
          points: coords
            .map((p) => project(p[0], p[1], p[2] ?? 0).join(","))
            .join(" "),
          fill,
          stroke,
          "stroke-width": "1",
        });
      polygon(
        [
          [-11, -8],
          [11, -8],
          [11, 8],
          [-11, 8],
        ],
        "#e0ebe4",
      );
      for (let i = -10; i <= 10; i += 2) {
        const a = project(i, -8),
          b = project(i, 8);
        el("line", {
          x1: String(a[0]),
          y1: String(a[1]),
          x2: String(b[0]),
          y2: String(b[1]),
          stroke: "#c4d5cc",
          "stroke-width": ".7",
        });
      }
      polygon(
        [
          [-11, -2.7],
          [11, -2.7],
          [11, 2.7],
          [-11, 2.7],
        ],
        "#71867e",
      );
      polygon(
        [
          [-11, 2.7],
          [11, 2.7],
          [11, 4.2],
          [-11, 4.2],
        ],
        state.mode === "proposed" ? "#73bba4" : "#bdcbc1",
      );
      const a = project(-10, 0),
        b = project(10, 0);
      el("line", {
        x1: String(a[0]),
        y1: String(a[1]),
        x2: String(b[0]),
        y2: String(b[1]),
        stroke: "#f0f3e9",
        "stroke-width": "2",
        "stroke-dasharray": "12 10",
      });
      // Shelter: footprint and roof, all local schematic metres.
      polygon(
        [
          [2, 4],
          [6, 4],
          [6, 6],
          [2, 6],
        ],
        "#a8cbbd",
      );
      polygon(
        [
          [2, 4, 2.7],
          [6, 4, 2.7],
          [6, 6, 2.7],
          [2, 6, 2.7],
        ],
        "#244d42",
      );
      for (const [x, z] of [
        [2, 4],
        [6, 4],
        [6, 6],
        [2, 6],
      ]) {
        const p = project(x, z),
          q = project(x, z, 2.7);
        el("line", {
          x1: String(p[0]),
          y1: String(p[1]),
          x2: String(q[0]),
          y2: String(q[1]),
          stroke: "#244d42",
          "stroke-width": "3",
        });
      }
      polygon(
        [
          [-9, -7],
          [-3, -7],
          [-3, -4],
          [-9, -4],
        ],
        "#b9cbbf",
      );
      polygon(
        [
          [-9, -7, 3],
          [-3, -7, 3],
          [-3, -4, 3],
          [-9, -4, 3],
        ],
        "#e9efe9",
      );
      polygon(
        [
          [-9, -4],
          [-3, -4],
          [-3, -4, 3],
          [-9, -4, 3],
        ],
        "#94b1a0",
      );
      if (state.mode === "proposed") {
        for (let z = -2; z <= 2; z += 0.75)
          polygon(
            [
              [-1, z],
              [1, z],
              [1, z + 0.32],
              [-1, z + 0.32],
            ],
            "#ecf7ec",
            "#ecf7ec",
          );
        polygon(
          [
            [7, 4.5],
            [9, 4.5],
            [9, 5.2],
            [7, 5.2],
          ],
          "#087f74",
        );
      }
      el(
        "text",
        {
          x: "35",
          y: "435",
          fill: "#5b7167",
          "font-size": "12",
          "font-family": "monospace",
        },
        "LOCAL METRES · SCHEMATIC · NOT SURVEYED",
      );
      const annotations =
        state.mode === "proposed"
          ? [...state.audit.proposedFeatures, state.audit.annotations[4]]
          : state.audit.annotations;
      for (const item of annotations) {
        const [x, y] = project(item.position[0], item.position[2], 2.2);
        const selected = item.id === state.selectedAnnotationId;
        const g = document.createElementNS(ns, "g");
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", item.label);
        g.style.cursor = "pointer";
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", selected ? "10" : "7");
        circle.setAttribute(
          "fill",
          item.kind === "issue" ? "#b77620" : "#087f74",
        );
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "3");
        g.append(circle);
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", String(x + 13));
        t.setAttribute("y", String(y + 4));
        t.setAttribute("fill", "#18342f");
        t.setAttribute("font-size", "12");
        t.setAttribute("font-weight", "600");
        t.textContent = item.label;
        g.append(t);
        g.addEventListener("click", () => onSelect(item.id));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(item.id);
          }
        });
        svg.append(g);
      }
    }
    draw(initial);
    return {
      update: draw,
      dispose() {
        svg.remove();
      },
    };
  },
};

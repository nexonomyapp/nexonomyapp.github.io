// Domain categories and display styles for the four supported asset types.
export const kinds = {
  BUILDING: { label: "Building", color: "#9b5938", fill: "#e3a681" },
  ROAD: { label: "Road", color: "#655591", fill: "#655591" },
  TREE: { label: "Tree", color: "#226748", fill: "#78aa86" },
  POND: { label: "Pond", color: "#21718a", fill: "#7fc3d7" },
};

const surfaces = new Set(["Polygon", "MultiPolygon"]);
const lines = new Set(["LineString", "MultiLineString"]);

export function normalizeFeatures(collection) {
  return collection.features.flatMap(({ id, properties, geometry }) => {
    if (!geometry || !/^(node|way|relation)\/\d+$/.test(id)) return [];
    const { tags = properties ?? {} } = properties ?? {};
    const { type } = geometry;
    let kind;
    let detail;
    if (type === "Point" && tags.natural === "tree") {
      kind = "TREE";
      detail = tags["species:en"] || tags.species || tags.genus;
    } else if (surfaces.has(type) && tags.natural === "water" && ["pond", "basin"].includes(tags.water)) {
      kind = "POND";
      detail = tags.water === "basin" ? "Basin" : "Pond";
    } else if (surfaces.has(type) && tags.building && tags.building !== "no") {
      kind = "BUILDING";
      detail = tags.building;
    } else if (lines.has(type) && tags.highway && !["construction", "proposed", "platform", "raceway"].includes(tags.highway)) {
      kind = "ROAD";
      detail = tags.highway;
    } else {
      return [];
    }
    const name = tags.name || tags["name:en"] || kinds[kind].label;
    const descriptor = detail && detail !== "yes" ? detail.replaceAll("_", " ") : "";
    return [{ type: "Feature", id, geometry, properties: { kind, name, descriptor, source: "OpenStreetMap" } }];
  });
}

export function makeQuery(bbox) {
  return `[out:json][timeout:10];(
    wr["building"]["building"!="no"](${bbox});
    way["highway"]["area"!="yes"](${bbox});
    node["natural"="tree"](${bbox});
    wr["natural"="water"]["water"~"^(pond|basin)$"](${bbox});
  );out body geom;`;
}

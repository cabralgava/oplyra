type Schema = Record<string, unknown>;

export type ValidationError = {
  path: string;
  keyword: string;
  message: string;
};

const ANNOTATION_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "title",
  "description",
  "examples"
]);

const SUPPORTED_VALIDATION_KEYWORDS = new Set([
  "$ref",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "const",
  "enum",
  "minLength",
  "pattern",
  "format"
]);

function decodePointerToken(token: string): string {
  return decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolvePointer(document: Schema, fragment: string): Schema | undefined {
  if (!fragment || fragment === "#") return document;
  if (!fragment.startsWith("#/")) return undefined;

  let value: unknown = document;
  for (const rawToken of fragment.slice(2).split("/")) {
    const token = decodePointerToken(rawToken);
    if (!value || typeof value !== "object" || !(token in value)) return undefined;
    value = (value as Record<string, unknown>)[token];
  }

  return value && typeof value === "object" ? (value as Schema) : undefined;
}

export function createSchemaRegistry(documents: Schema[]): Map<string, Schema> {
  const registry = new Map<string, Schema>();
  for (const document of documents) {
    if (typeof document.$id !== "string") throw new Error("Schema sem $id");
    if (registry.has(document.$id)) throw new Error(`$id duplicado: ${document.$id}`);
    registry.set(document.$id, document);
  }
  return registry;
}

function resolveRef(ref: string, current: Schema, registry: Map<string, Schema>): Schema | undefined {
  const hashIndex = ref.indexOf("#");
  const base = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "";
  const target = base ? registry.get(base) : current;
  return target ? resolvePointer(target, fragment) : undefined;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validateNode(
  schema: Schema,
  value: unknown,
  path: string,
  current: Schema,
  registry: Map<string, Schema>,
  errors: ValidationError[]
): void {
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, current, registry);
    if (!resolved) {
      errors.push({ path, keyword: "$ref", message: `Referência não resolvida: ${schema.$ref}` });
      return;
    }
    const hashIndex = schema.$ref.indexOf("#");
    const base = hashIndex >= 0 ? schema.$ref.slice(0, hashIndex) : schema.$ref;
    validateNode(resolved, value, path, base ? registry.get(base)! : current, registry, errors);
    return;
  }

  const acceptedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (acceptedTypes.length && !acceptedTypes.some((type) => typeof type === "string" && matchesType(value, type))) {
    errors.push({ path, keyword: "type", message: `Tipo inválido; esperado ${acceptedTypes.join("|")}` });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push({ path, keyword: "enum", message: "Valor fora do enum" });
  }

  if ("const" in schema && !Object.is(schema.const, value)) {
    errors.push({ path, keyword: "const", message: "Valor diferente do const" });
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({ path, keyword: "minLength", message: `Comprimento menor que ${schema.minLength}` });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, keyword: "pattern", message: "Valor não corresponde ao pattern" });
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push({ path, keyword: "format", message: "Valor não é um date-time válido" });
    }
  }

  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push({ path, keyword: "minimum", message: `Valor menor que ${schema.minimum}` });
  }
  if (typeof value === "number" && typeof schema.maximum === "number" && value > schema.maximum) {
    errors.push({ path, keyword: "maximum", message: `Valor maior que ${schema.maximum}` });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, keyword: "minItems", message: `Array possui menos de ${schema.minItems} itens` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({ path, keyword: "maxItems", message: `Array possui mais de ${schema.maxItems} itens` });
    }
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push({ path, keyword: "uniqueItems", message: "Array contém itens duplicados" });
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) => validateNode(schema.items as Schema, item, `${path}[${index}]`, current, registry, errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    for (const key of required) {
      if (!(key in object)) errors.push({ path, keyword: "required", message: `Campo obrigatório ausente: ${key}` });
    }

    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, Schema> : {};
    for (const [key, item] of Object.entries(object)) {
      if (properties[key]) validateNode(properties[key], item, `${path}.${key}`, current, registry, errors);
      else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, keyword: "additionalProperties", message: "Campo não permitido" });
      }
    }
  }
}

export function validateSchema(schema: Schema, value: unknown, registry: Map<string, Schema>): ValidationError[] {
  const errors: ValidationError[] = [];
  validateNode(schema, value, "$", schema, registry, errors);
  return errors;
}

export function unsupportedKeywords(schema: Schema): string[] {
  const unsupported = new Set<string>();

  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "properties" || key === "$defs") {
        if (child && typeof child === "object" && !Array.isArray(child)) {
          Object.values(child as Record<string, unknown>).forEach(visit);
        }
        continue;
      }
      if (ANNOTATION_KEYWORDS.has(key)) continue;
      if (!SUPPORTED_VALIDATION_KEYWORDS.has(key)) unsupported.add(key);
      visit(child);
    }
  }

  visit(schema);
  return [...unsupported].sort();
}

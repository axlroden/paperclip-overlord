declare module "overlord-quips" {
  const lines: { text: string; tags: string[] }[];
  export default lines;
}

declare module "*.css" {
  const text: string;
  export default text;
}

declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}

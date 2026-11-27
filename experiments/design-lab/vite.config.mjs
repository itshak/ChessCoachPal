import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({base:"./",esbuild:{jsx:"automatic"},publicDir:fileURLToPath(new URL("../../public/icon",import.meta.url)),server:{fs:{allow:[fileURLToPath(new URL("../..",import.meta.url))]}},build:{manifest:true}});

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const navigation = require("next/navigation");

export const notFound = navigation.notFound;
export const redirect = navigation.redirect;
export const permanentRedirect = navigation.permanentRedirect;
export const usePathname = navigation.usePathname;
export const useRouter = navigation.useRouter;
export const useSearchParams = navigation.useSearchParams;
export const useParams = navigation.useParams;

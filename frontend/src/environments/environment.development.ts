// Development build (ng serve): Django runs on port 8000 of the same host,
// so the app also works from another device on the local network.
export const environment = {
  production: false,
  apiUrl: `http://${window.location.hostname}:8000/api`,
};

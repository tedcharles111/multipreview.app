import { ApiClient, ApiClientInMemoryContextProvider } from '@northflank/js-client';

let client = null;

async function initClient() {
  if (client) return client;
  const contextProvider = new ApiClientInMemoryContextProvider();
  await contextProvider.addContext({
    name: 'default',
    token: process.env.NORTHFLANK_API_TOKEN,
  });
  client = new ApiClient(contextProvider, { throwErrorOnHttpErrorCode: true });
  return client;
}

export async function createPreviewService(sessionId, downloadUrl, startCommand) {
  const api = await initClient();
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  const serviceName = `preview-${sessionId}`;

  let port = 3000;
  if (startCommand.includes('vite') || startCommand.includes('dev')) {
    port = 5173;
  }

  const startupScript = `curl -s ${downloadUrl} | tar -xzv && npm install && ${startCommand}`;

  const servicePayload = {
    name: serviceName,
    billing: { deploymentPlan: 'nf-compute-20' },
    deployment: {
      instances: 1,
      external: {
        imagePath: 'node:18-alpine',
        command: ['/bin/sh', '-c', startupScript],
        ports: [{ portNumber: port, protocol: 'HTTP', public: true }],
        environmentVariables: [],
      },
    },
  };

  try {
    console.log('Creating service with payload:', JSON.stringify(servicePayload, null, 2));
    // Official SDK uses /v1/projects/{projectId}/services under the hood
    const response = await api.create.service.deployment({
      parameters: { projectId },
      data: servicePayload,
    });

    const service = response.data;
    const serviceId = service.id;

    // Wait for service to become healthy
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await api.get.service.deployment({
        parameters: { projectId, serviceId },
      });
      if (status.data.status === 'running' && status.data.deploymentStatus === 'healthy') {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error('Service did not become healthy in time');

    const previewUrl = `https://${serviceName}.northflank.app`;
    return { serviceId, previewUrl };
  } catch (error) {
    console.error('Northflank error:', error);
    throw error;
  }
}

export async function stopService(serviceId) {
  const api = await initClient();
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  try {
    await api.delete.service.deployment({ parameters: { projectId, serviceId } });
    return true;
  } catch (error) {
    console.error('Error stopping service:', error);
    return false;
  }
}

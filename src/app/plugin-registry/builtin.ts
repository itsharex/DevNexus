import { register } from "@/app/plugin-registry/registry";
import { redisManagerPlugin } from "@/plugins/redis-manager";
import { mongodbClientPlugin } from "@/plugins/mongodb-client";
import { mysqlClientPlugin } from "@/plugins/mysql-client";
import { s3ClientPlugin } from "@/plugins/s3-client";
import { sshClientPlugin } from "@/plugins/ssh-client";

let initialized = false;

export function registerBuiltinPlugins(): void {
  if (initialized) {
    return;
  }

  register(redisManagerPlugin);
  register(sshClientPlugin);
  register(s3ClientPlugin);
  register(mongodbClientPlugin);
  register(mysqlClientPlugin);
  initialized = true;
}


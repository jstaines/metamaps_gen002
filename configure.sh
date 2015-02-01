# Make sure we've got NFS handy.
if [ $(uname) == 'Linux' ] && [ ! -e /etc/init.d/nfs-kernel-server ]; then
  sudo apt-get install -y nfs-common nfs-kernel-server rpcbind
fi

# Vagrant up
vagrant up

# Bundle!
vagrant ssh --command "cd /vagrant; bundle install";

# copy the db config
vagrant ssh --command "cd /vagrant; cp config/database.yml.default config/database.yml";

# Rake all the things
vagrant ssh --command "cd /vagrant; rake db:create; rake db:schema:load; rake db:fixtures:load"
